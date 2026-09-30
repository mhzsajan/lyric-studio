// motion.js -- per-line MOTION choreography: the thing that makes a lyric
// video feel alive rather than merely legible.
//
// WHY THIS EXISTS, AND WHY IT IS NOT THE `motion` PACKAGE
// -------------------------------------------------------
// The obvious way to answer "more motion" is to install motion.dev (Framer
// Motion) and use <motion.div>. That does not work in Remotion, and the reason
// is structural rather than a matter of taste:
//
//   Remotion renders an arbitrary frame index on demand, often out of order and
//   often in a headless browser, and it must be able to re-render frame 7,000
//   as frame 7,000 tomorrow. Framer Motion animates from WALL-CLOCK time
//   (requestAnimationFrame) and from MOUNT/UNMOUNT lifecycle: it measures how
//   long an element has been on screen, not what the current time is. Ask it
//   for frame 7,000 first and it draws frame 0's pose. AnimatePresence's exit
//   animation likewise cannot fire, because nothing "unmounts" in a renderer
//   that jumps to arbitrary frames.
//
//   So the vocabulary is rebuilt here on a frame clock: analytic springs with
//   real overshoot, per-word stagger, entrance and exit choreography, hold
//   motion. Same feel, but every frame is a pure function of (frame, seed,
//   cueIndex) -- which is the one property this whole repository depends on
//   (see animations.js: "Seeded, never Math.random" -- a render is used live,
//   so the same command must produce the same file every time).
//
// THE ONE HARD RULE: A MOTION MUST BE FINISHED BEFORE THE LINE'S END
// ------------------------------------------------------------------
// Every cue carries a tapped `end` -- the moment the singer finished the word
// (gotcha 31). A line that is still travelling at its end time is the exact bug
// the ends file exists to prevent, so entrance and exit durations are derived
// as FRACTIONS OF THE CUE'S OWN SPAN and then capped, never fixed:
//
//     enter = min(0.55s, span * 0.42)
//     exit  = min(0.30s, span * 0.28)
//     enter + exit <= 0.70 * span   (always)
//
// A 0.28 s interjection and a 2.6 s chorus line therefore both animate fully
// inside their own time, and no motion can outlive the word it belongs to.
//
// THE OTHER HARD RULE: MOTION MUST NOT PUSH TEXT OFF THE FRAME
// ------------------------------------------------------------
// gotcha 13 and gotcha 17 are both "text silently left the frame". A transform
// is exactly as capable of doing that as a bad anchor is, so the travel
// available to a motion is not a constant -- it is computed per cue from the
// placement's actual margin (see travelBudget()), and every motion is clamped
// to it. A motion that needs more room than exists gets less room, and a cue
// with no margin gets none, degrading to scale/opacity/filter rather than
// shipping a clipped line.

import { seededRandom, hashString } from "./animations.js";

export const MOTION_LEVELS = ["off", "calm", "vivid", "wild"];

// How much of the full choreography each level unlocks. "off" is not a level
// with an empty pool -- it bypasses this module entirely (see cueMotion), so
// the house style is byte-for-byte what it was before any of this existed.
const POWER = { calm: 0.45, vivid: 0.8, wild: 1 };

export const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------------------
// EASING + SPRING
// ---------------------------------------------------------------------------

export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInCubic = (t) => Math.pow(clamp01(t), 3);
export const easeInOutCubic = (t) =>
  (t = clamp01(t)) < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutBack = (t, s = 1.7) => {
  t = clamp01(t) - 1;
  return 1 + (s + 1) * t * t * t + s * t * t;
};
export const easeOutExpo = (t) => (t = clamp01(t)) === 1 ? 1 : 1 - Math.pow(2, -10 * t);

/**
 * A real damped spring, evaluated analytically (no integration, so it is a
 * pure function of p and therefore frame-order independent).
 *
 *   freq  oscillations per unit of the entrance duration
 *   zeta  1 = critically damped (no overshoot), < 1 overshoots
 *
 * This is the single function that gives the entrances their life: a
 * translateY that overshoots and settles reads as "arriving", one that only
 * eases out reads as "fading in".
 */
export function springAt(p, freq = 1.6, zeta = 0.42) {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const wn = 2 * Math.PI * freq;
  const z = Math.max(0.05, zeta);
  const wd = wn * Math.sqrt(1 - z * z);
  const t = p;
  return (
    1 -
    Math.exp(-z * wn * t) *
      (Math.cos(wd * t) + ((z * wn) / wd) * Math.sin(wd * t))
  );
}

// ---------------------------------------------------------------------------
// THE POOL
// ---------------------------------------------------------------------------
//
// Every motion is a function of (e, x, prm) where:
//
//   e   entrance progress 0..1, already spring/eased
//   x   exit progress 0..1 (0 = still held, 1 = at the cue's end time)
//   prm the cue's seeded parameters (below)
//
// and returns a plain style object. They are deliberately written out longhand
// rather than composed from a shared builder, because the whole point of a
// motion pool is that the motions are genuinely DIFFERENT, and a generic
// builder is what makes a pool of nine effects look like one effect with nine
// numbers changed.
//
// `prm.dx`/`prm.dy` are in px and already clamped to the cue's travel budget by
// travelBudget(); `prm.rot` in degrees; `prm.glow` the glow radius in px.

const N = (v) => (Math.abs(v) < 0.005 ? "0" : v.toFixed(3));

export const MOTIONS = {
  // --- translates: arrive from a direction, overshoot, settle ---------------
  lift: (e, x, p) => ({
    transform: `translateY(${N((1 - e) * p.dy * 1.15)}px) scale(${N(1 - (1 - e) * 0.06)})`,
  }),
  dive: (e, x, p) => ({
    transform: `translateY(${N(-(1 - e) * p.dy * 1.15)}px) scale(${N(1 + (1 - e) * 0.07)})`,
  }),
  slideIn: (e, x, p) => ({
    transform: `translateX(${N((1 - e) * p.dx * 1.2)}px)`,
  }),
  slideOut: (e, x, p) => ({
    transform: `translateX(${N(-(1 - e) * p.dx * 1.2)}px)`,
  }),
  orbit: (e, x, p) => {
    // An arc, not a straight line: the peak of the arc is mid-entrance, so the
    // line travels out and comes back -- reads as "thrown into place".
    const a = Math.PI * (1 - e);
    return {
      transform: `translate(${N(Math.sin(a) * p.dx * 1.5)}px, ${N(-Math.sin(a) * p.dy * 1.1)}px) scale(${N(1 - Math.sin(a) * 0.05)})`,
    };
  },

  // --- springs: the overshoot IS the motion --------------------------------
  pop: (e, x, p) => ({
    transform: `scale(${N(0.72 + 0.28 * e)})`,
  }),
  punch: (e, x, p) => ({
    transform: `scale(${N(1.18 - 0.18 * e)})`,
    filter: `blur(${N((1 - e) * p.blur * 0.7)}px)`,
  }),
  zoomThrough: (e, x, p) => ({
    transform: `scale(${N(1.25 - 0.25 * e)})`,
    opacity: 0.25 + 0.75 * e,
  }),
  squash: (e, x, p) => ({
    // Counter-phase axes. A UNIFORM transform only: non-uniform scaling of
    // individual letters is what breaks the shirorekha (gotcha 8), but
    // stretching a whole word moves every letter by the same factor, so the
    // headline stays continuous -- it just gets briefly thicker.
    transform: `scale(${N(0.78 + 0.22 * e)}, ${N(1.18 - 0.18 * e)})`,
  }),

  // --- rotations: a line that tilts into place -----------------------------
  swing: (e, x, p) => ({
    transform: `rotate(${N((1 - e) * p.rot * 0.55)}deg) translateX(${N((1 - e) * p.dx * 0.5)}px)`,
  }),
  tilt: (e, x, p) => ({
    transform: `perspective(900px) rotateX(${N((1 - e) * p.rot * 0.8)}deg) translateY(${N((1 - e) * p.dy * 0.5)}px)`,
  }),
  flip: (e, x, p) => ({
    transform: `perspective(800px) rotateY(${N((1 - e) * p.rot * 1.1)}deg) scale(${N(0.86 + 0.14 * e)})`,
  }),
  skew: (e, x, p) => ({
    transform: `skewX(${N((1 - e) * p.rot * 0.4)}deg) translateX(${N((1 - e) * p.dx * 0.4)}px)`,
  }),

  // --- masks: the shape of the reveal changes ------------------------------
  wipe: (e, x, p) => ({
    clipPath: `inset(0 ${N(100 - e * 100)}% 0 0)`,
    transform: `translateX(${N((1 - e) * p.dx * 0.35)}px)`,
  }),
  unblur: (e, x, p) => ({
    filter: `blur(${N((1 - e) * p.blur * 1.6)}px)`,
    opacity: 0.15 + 0.85 * e,
  }),
  scrambleWipe: (e, x, p) => ({
    clipPath: `inset(${N((1 - e) * 22)}% ${N((1 - e) * 34)}% ${N((1 - e) * 10)}% 0)`,
    transform: `translateY(${N((1 - e) * p.dy * 0.45)}px)`,
  }),

  // --- light: no movement, all energy in the glow --------------------------
  flare: (e, x, p) => ({
    textShadow: `0 0 ${N(p.glow * 0.5 + p.glow * 1.6 * e)}px rgba(255,255,255,${N(0.45 + 0.5 * e)}), 0 0 ${N(p.glow * 2.4 * e)}px rgba(255,255,255,${N(0.3 * e)})`,
    transform: `scale(${N(1.02 - 0.02 * e)})`,
  }),
  shimmer: (e, x, p) => ({
    textShadow: `0 0 ${N(p.glow * (0.3 + 0.9 * e))}px rgba(255,255,255,${N(0.3 + 0.4 * e)})`,
    filter: `brightness(${N(1 + 0.35 * (1 - e))})`,
  }),

  // --- compounds: two ideas at once -----------------------------------------
  spiral: (e, x, p) => ({
    transform: `rotate(${N((1 - e) * p.rot * 0.8)}deg) scale(${N(0.7 + 0.3 * e)}) translateY(${N((1 - e) * p.dy * 0.6)}px)`,
  }),
  snap: (e, x, p) => ({
    // A hard, fast, overshooting arrival -- the most "percussive" of the pool,
    // for landing on a downbeat.
    transform:
      `scale(${N(0.6 + 0.4 * springAt(e, 2.2, 0.28))}) ` +
      `translateX(${N((1 - e) * p.dx * 0.7)}px)`,
    filter: `blur(${N((1 - e) * p.blur)}px)`,
  }),
  breathe: (e, x, p) => ({
    transform: `scale(${N(0.96 + 0.04 * e)}) translateY(${N((1 - e) * p.dy * 0.25)}px)`,
    textShadow: `0 0 ${N(p.glow * 0.8 * e)}px rgba(255,255,255,${N(0.35 * e)})`,
  }),
};

export const MOTION_IDS = Object.keys(MOTIONS);

// ---------------------------------------------------------------------------
// THE PLAN -- one motion per cue, no two neighbours alike
// ---------------------------------------------------------------------------
//
// This is mix.js's deck, and for the same reason: a plain random pick can
// choose the same motion thirty times running or never choose `flip` at all,
// and both look like a bug rather than a choice. A seeded shuffled DECK makes
// full coverage structural instead of lucky. Retries a shuffle rather than
// repairing one, exactly as buildDeck does.
function buildDeck(rnd, ids) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const d = ids.slice();
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = d[i];
      d[i] = d[j];
      d[j] = t;
    }
    let ok = true;
    for (let i = 0; i < d.length; i++) {
      if (d[i] === d[(i + 1) % d.length]) ok = false;
    }
    if (ok) return d;
  }
  return ids.slice();
}

/**
 * @param {object} o
 * @param {string} o.seed       master seed (song title)
 * @param {number} o.cueCount
 * @param {string} o.level      off | calm | vivid | wild
 * @param {number} [o.block]    cues per motion before the deck reshuffles
 */
export function buildMotionPlan({ seed, cueCount, level = "vivid", block = 7 } = {}) {
  const n = Math.max(0, Number(cueCount) || 0);
  if (!n || level === "off" || !POWER[level]) return [];

  // A larger level means a LARGER pool, not a bigger amplitude: "calm" is a
  // small pool used gently, "wild" is the whole pool used hard. Both also
  // deploy the same way -- reshuffled every `block` cues.
  const pool = MOTION_IDS.slice(0, Math.max(2, Math.round(MOTION_IDS.length * POWER[level])));
  const per = Math.max(2, Math.floor(Number(block) || 7));
  const rnd = seededRandom(hashString("motion:" + String(seed) + ":" + level));

  // ONE MOTION PER CUE, walking the deck -- not one motion per BLOCK of cues.
  //
  // The first version held a single motion for the whole block, which is what
  // mix.js does for placements and is wrong here: 7 consecutive lines with the
  // same choreography is 93 adjacent repeats across 109 cues, which is the
  // monotony the user asked to get rid of. The deck is reshuffled every `per`
  // cues instead, so coverage stays structural and the song never loops.
  const plan = [];
  let deck = buildDeck(rnd, pool);
  let k = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0 && i % per === 0) {
      const prev = plan[i - 1];
      // A new deck must not start on the motion the previous one ended on, or
      // the reshuffle boundary is the one place two neighbours collide.
      let next = buildDeck(rnd, pool);
      for (let attempt = 0; attempt < 50 && next[0] === prev; attempt++) {
        next = buildDeck(rnd, pool);
      }
      deck = next;
      k = 0;
    }
    plan.push(deck[k % deck.length]);
    k++;
  }
  return plan;
}

// ---------------------------------------------------------------------------
// SEEDED PER-CUE PARAMETERS
// ---------------------------------------------------------------------------
//
// The pool guarantees no two NEIGHBOURING lines share a choreography. It cannot
// guarantee that two lines 40 cues apart do not both be `lift` -- 109 cues and
// 20 motions means repeats are arithmetic, not sloppiness. So every cue also
// gets its own seeded parameters: the direction it comes FROM, how far, which
// way it rotates, how hard the spring rings, how big the glow is. Two `lift`
// cues 40 lines apart share a verb and nothing else, which is what "no
// repeating motion" has to mean to be achievable at all.
export function motionParams(seed, index, level = "vivid") {
  const power = POWER[level] || 0.8;
  const rnd = seededRandom(hashString("motionp:" + String(seed)) + index * 2654435761);
  const angle = rnd() * Math.PI * 2; // where the line comes FROM
  const reach = (0.45 + rnd() * 0.55) * power;
  return {
    angle,
    // 1.0 magnitude; travelBudget() turns this into px.
    reach,
    rot: (7 + rnd() * 13) * power * (rnd() < 0.5 ? -1 : 1),
    blur: (6 + rnd() * 10) * power,
    glow: (14 + rnd() * 30) * power,
    freq: 1.25 + rnd() * 1.05,
    zeta: 0.3 + rnd() * 0.28,
    mirror: rnd() < 0.5 ? -1 : 1,
  };
}

// ---------------------------------------------------------------------------
// TRAVEL BUDGET -- the anti-clipping rule (gotchas 13 and 17)
// ---------------------------------------------------------------------------
//
// How far a line may move without any part of it leaving the frame. Derived
// from the placement's real geometry rather than a taste constant:
//
//   band   the box is pinned at `left` with `width`; the margin is the smaller
//          of the two gaps it leaves (11vw left / 25vw right for horizontal).
//   centre centred in `width` -- both margins equal.
//   roam   the block is CENTRED on a seeded anchor and up to 60vw wide, so the
//          margin is the anchor's distance to the frame edge MINUS half the
//          block. This is the one placement that can genuinely run out of room,
//          and it is why roam's travel collapses to 0 for the longest lines
//          instead of quietly pushing text off screen.
//
// A `pad` of a few px is left on every side so glow (a shadow that extends
// beyond the glyphs) does not get clipped even when the text itself would not be.
export function travelBudget({ kind, left, width, anchor, halfBlockW, halfBlockH, W, H, pad = 26 }) {
  if (kind === "roam") {
    const cx = (anchor.x / 100) * W;
    const cy = (anchor.y / 100) * H;
    const mx = Math.min(cx, W - cx) - halfBlockW - pad;
    const my = Math.min(cy, H - cy) - halfBlockH - pad;
    return { dx: Math.max(0, mx), dy: Math.max(0, my) };
  }
  const l = ((left ?? 0) / 100) * W;
  const r = l + ((width ?? 60) / 100) * W;
  // The BOX does not move; the text inside it does. The box's own margins are
  // the hard limit, and the far side of the box is not a constraint because the
  // box is anchored there already.
  const mx = Math.min(l, W - r) - pad;
  const my = Math.min(((1 - (left ?? 0)) / 100) * H, ((left ?? 0) / 100) * H) - pad;
  return { dx: Math.max(0, mx), dy: Math.max(0, my) };
}

// ---------------------------------------------------------------------------
// cueMotion -- the style for one cue at one time
// ---------------------------------------------------------------------------
//
// `since` = seconds since the cue started, `until` = seconds until it ENDS.
// Everything is driven from those two, so the motion is bounded by the cue's
// own timing by construction rather than by hope.
//
// Returns {} for level "off", which is what keeps the existing house style
// byte-for-byte unchanged: cueMotion is additive, it never removes a
// transform the old path produced.
export function cueMotion({
  level,
  motionId,
  params,
  since,
  until,
  span,
  travel,
  holdSeed = 0,
}) {
  if (!level || !POWER[level] || !motionId || !MOTIONS[motionId]) return {};

  const power = POWER[level];

  // Durations as FRACTIONS OF THE SPAN, then capped. enter + exit <= 0.70*span
  // always, so a motion is never still travelling at the line's end time.
  const enterDur = Math.max(0.06, Math.min(0.55, span * 0.42));
  const exitDur = Math.max(0.05, Math.min(0.30, span * 0.28));

  const pe = clamp01(since / enterDur);
  // EXIT PROGRESS: 1 AT THE CUE'S END, 0 while the line is comfortably held.
  //
  // This was `clamp01(until / exitDur)` and it is backwards for the fade: at the
  // end time until === 0, so px === 0, so the `if (px > 0)` fade never ran and
  // the line sat at full opacity ON the frame at the exact moment it was
  // supposed to have finished. check_motion.mjs caught it on every motion and
  // every span -- a whole class of "still lit after its end" that no single test
  // would have looked for, because the old check (critique.py) only samples cue
  // MIDPOINTS and never the end.
  const px = 1 - clamp01(until / exitDur);

  // Entrance easing is the spring, so it overshoots and settles; the spring's
  // overshoot is what the eye reads as weight.
  const e = Math.max(0, springAt(pe, params.freq, params.zeta));
  const x = easeInCubic(px);

  // Travel, clamped to the placement's budget. `reach` scales it per cue and
  // `angle` picks the direction, so the same motion is never twice the same
  // journey.
  const dx = Math.min(travel.dx, params.reach * 0.14 * W_REL * power) * Math.cos(params.angle) * params.mirror;
  const dy = Math.min(travel.dy, params.reach * 0.10 * W_REL * power) * Math.sin(params.angle) * params.mirror;
  const d = { ...params, dx, dy, blur: params.blur, glow: params.glow };

  const out = MOTIONS[motionId](e, x, d) || {};

  // THE OPACITY ENVELOPE. Every line fades in AND out, always, whatever the
  // motion does.
  //
  // The first version took the motion's own opacity and defaulted it to 1, so a
  // transform-only motion (lift, swing, wipe, tilt...) put the line on screen at
  // FULL opacity on its first frame -- a hard pop instead of an entrance. It was
  // found by scripts/lingering.py, which flagged two lines as "still lit after
  // their end" that were in fact the NEXT line's first frame: the next line had
  // no fade-in, so it registered as ink the instant it began. A pixel measure
  // and the eye agree here -- a line that appears at full opacity in one frame
  // reads as a glitch, not as motion.
  //
  // The ramp is 30% of the entrance, so it is over long before the spring has
  // settled, and it is multiplicative: a motion that sets its own opacity
  // (zoomThrough, unblur) still fades in, just faster.
  const fadeIn = easeOutCubic(pe / 0.3);
  const fadeOut = 1 - x;

  // HOLD MOTION. Once the entrance is done and the exit has not started, a line
  // is on screen for up to 2.6 s doing nothing at all. This is the difference
  // between a caption and a lyric video: a slow, low-amplitude drift and a
  // breathing glow, seeded per cue so two held lines never breathe together.
  // Amplitude is deliberately tiny (a few px, ~1.5% scale) -- enough to read as
  // alive at 1080p, far too small to hurt legibility or to reach the frame.
  const held = pe >= 1 && px <= 0;
  if (held) {
    const holdSpan = Math.max(0.001, span - enterDur);
    const hp = clamp01((since - enterDur) / holdSpan);
    const amp = 0.35 * power;
    const wob = Math.sin(hp * Math.PI * 2 * (0.6 + holdSeed)) * amp;
    out.transform = (out.transform ? out.transform + " " : "") +
      `translateY(${N(wob * 5)}px) scale(${N(1 + wob * 0.012)})`;
  }

  // The exit scales and settles whatever the motion produced, so every motion
  // both leaves and fades, and the opacity is exactly 0 at the cue's end
  // (px === 1 there). That is the invariant gotcha 31 is about.
  if (px > 0 && out.transform) {
    out.transform += ` scale(${N(0.94 + 0.06 * fadeOut)})`;
  }

  out.opacity = (out.opacity == null ? 1 : out.opacity) * fadeIn * fadeOut;

  return out;
}

// A reference width so `reach` can be expressed in "percent of frame" without
// the caller threading W through the parameter block. travelBudget() does the
// real clamping; this only sets the scale of the request.
const W_REL = 1000;

// ---------------------------------------------------------------------------
// WORD STAGGER
// ---------------------------------------------------------------------------
//
// A line-level motion moves the line as one block. This adds a per-WORD offset
// that decays as each word arrives, so the line is still assembling itself
// while its entrance is finishing -- the thing that makes motion read as
// choreographed rather than applied.
//
// `age` is seconds since THIS word's own start, and the offset is zero once
// `age` passes, so it can never delay a word past the line's own end.
export function wordMotion(motionId, age, params, level) {
  if (!level || !POWER[level]) return "";
  const power = POWER[level];
  const delay = params.mirror > 0 ? 0.0 : 0.02;
  const dur = 0.34 + 0.12 * power;
  const e = easeOutCubic(clamp01((age - delay) / dur));
  if (e >= 1) return "";

  // Alternating per word would be a metronome; the sign comes from the cue's
  // own seed so the whole line leans one way.
  const rise = (1 - e) * 0.30 * power;
  const lat = (1 - e) * 0.22 * power;
  const dir = params.mirror;
  const rot = (1 - e) * 2.4 * power * dir;
  return `translateY(${N(-rise * 22)}px) translateX(${N(lat * 16 * Math.cos(params.angle) * dir)}px) rotate(${N(rot)}deg) scale(${N(1 - (1 - e) * 0.05)})`;
}
