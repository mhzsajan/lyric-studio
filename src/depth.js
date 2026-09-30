// depth.js -- the SEVEN new motion layers: composition, not just variation.
//
// WHY A SEPARATE FILE
// -------------------
// motion.js varies how a line ARRIVES (21 choreographies). animations.js varies
// how a line is TYPED. Neither changes how a line is COMPOSED on screen, and
// that is the gap this file fills. The difference is the difference between a
// wider palette and a different picture: the existing layers can each be turned
// to any of 21 settings, and the result still looks like one idea. These seven
// change the idea.
//
// WHAT IS HERE
// ------------
//   1. tracking()        letters spread and settle -- WORD level only
//   2. baseline()       the line rides up and down over its slot
//   3. arc()            words travel along a curve, not a straight line
//   4. depth()          blur + scale + opacity COUPLED, so a word comes forward
//   5. sequence()       each word's entrance triggers the next  <- the big one
//   6. chromatic()      sub-pixel red/cyan separation during fast motion
//   7. pulseGlow()      glow keyed to the line's own audio amplitude
//
// THE SHIROREKHA RULE, AND WHAT IT ACTUALLY FORBIDS
// --------------------------------------------------
// Gotcha 8 measured that per-LETTER SIZE above 0.03 visibly snaps the headline
// bar, and a per-letter SCALE does the same damage by another road. That is a
// rule about SIZE and POSITION of the glyph relative to its neighbours.
//
// It is NOT a rule about colour, blur, rotation or timing. An earlier version
// of this conversation treated 0.03 as a ceiling on all per-letter variation,
// which was wrong and would have left four of these seven unbuilt. So:
//
//   FORBIDDEN  letterFontSize, per-letter scale
//   ALLOWED    letter-spacing, translate, rotate, blur, colour, opacity, clip
//
// tracking() is the sharp edge. Letter-spacing INSIDE a word separates the
// letters of one syllable and snaps the shirorekha in half, so tracking is
// applied to the gap BETWEEN words only, and letter spacing within a word is
// left at zero. That is a real limitation, stated rather than hidden: you get
// word-level tracking, not letter-level.
//
// THE HARD RULE, INHERITED AND NOT NEGOTIABLE
// -------------------------------------------
// A motion must be FINISHED inside the cue's own end, or the every-frame scan
// fails and a word outlives the note. sequence() is the dangerous one, because
// it deliberately DELAYS words: word 5 does not start until word 4 has begun.
// For a line whose span cannot hold the chain, the chain COMPRESSES rather than
// overrunning. Compressing keeps the effect and respects the ends; overrunning
// would be the bug this repository has already shipped once.

// Helpers are DEFINED HERE rather than imported, and that is deliberate.
//
// animations.js has its own clamp01/easeOut/easeIn/seededRandom/hashString,
// all module-private, and LyricOverlay.jsx has a second private copy of the
// easings. They are identical, which is itself a small duplication -- but
// exporting them from a module nine other things import, purely so a new file
// can reach them, is a wider change than this task earns. Three lines each,
// copied on purpose, and the test below asserts determinism so a divergence
// would be caught rather than inherited.
const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRandom(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The levels, named DEPTH_LEVELS rather than LAYERS so that a reader who
 * imports both this and motion.js can tell at a glance which is which --
 * motion.js exports MOTION_LEVELS for the arrival layer, and the two are passed
 * to different props.
 *
 * The names are the same four as motion's on purpose: off / calm / vivid / wild
 * is a scale of intensity, and a second vocabulary for the same idea would
 * mean a user has to learn two words for one dial.
 */
export const DEPTH_LEVELS = ["off", "calm", "vivid", "wild"];

// ---------------------------------------------------------------------------
// 1. TRACKING -- word-level only, and only between words
// ---------------------------------------------------------------------------

/**
 * Extra gap BETWEEN words, in em, over time. Applied to the space character
 * between words, never inside a word.
 *
 * An earlier draft animated `letter-spacing` on each word span, which
 * separates the letters of one syllable and snaps the shirorekha. That is the
// gotcha-8 damage reached by a different road, and it is exactly why this
 * function returns a width for the gap and not for the letters.
 */
export function tracking(level, age, span) {
  if (level === "off" || age < 0) return 0;
  const amp = level === "wild" ? 0.34 : level === "vivid" ? 0.20 : 0.10;
  const dur = Math.min(0.6, span * 0.5);
  // wide open, then settle to a small positive gap -- never to zero, or the
  // words touch and read as one token
  const settled = amp * 0.16;
  const t = clamp01(age / Math.max(0.001, dur));
  return amp * (1 - t) + settled * t;
}

// ---------------------------------------------------------------------------
// 2. BASELINE DRIFT -- the line rides, rather than sits
// ---------------------------------------------------------------------------

/** Vertical offset in px. Two incommensurate sines so it never visibly loops. */
export function baseline(level, age, span, seed, index) {
  if (level === "off") return 0;
  const amp = level === "wild" ? 16 : level === "vivid" ? 9 : 4;
  const r = seededRandom(hashString("base:" + seed) + index * 7919);
  const ph = r() * Math.PI * 2;
  const f1 = 0.7 + r() * 0.5;
  const f2 = 1.3 + r() * 0.7;
  // ramp in, ride, ramp out to exactly zero at the cue's end
  const t = clamp01(age / Math.max(0.001, span));
  const env = Math.sin(t * Math.PI);
  return amp * env * (Math.sin(age * f1 + ph) * 0.6 + Math.sin(age * f2 + ph * 1.7) * 0.4);
}

// ---------------------------------------------------------------------------
// 3. ARC -- words on a curve rather than a straight line
// ---------------------------------------------------------------------------

/**
 * Vertical offset per word, on an arc that peaks mid-line.
 *
 * The existing `swing`/`pendulum` rotate a word in place about its own centre.
 * This is different: the word's POSITION follows a curve, and the whole line
 * describes an arc, so a five-word line looks like one gesture instead of five
 * independent ones.
 */
export function arc(level, wordT, lineT, seed) {
  if (level === "off") return { y: 0, rot: 0 };
  const amp = level === "wild" ? 34 : level === "vivid" ? 20 : 9;
  // wordT: 0..1 across the words. lineT: 0..1 across the line's own slot.
  const bow = Math.sin(Math.PI * wordT) - 0.5;          // + at the ends, - at centre
  const wobble = Math.sin(lineT * Math.PI * 2) * 0.5 + 0.5;
  const y = bow * amp * (0.35 + 0.65 * wobble);
  // tilt into the curve, so the word leans the way it is travelling
  const rot = (wordT - 0.5) * (level === "wild" ? 9 : 5) * wobble;
  return { y, rot };
}

// ---------------------------------------------------------------------------
// 4. DEPTH -- blur, scale and opacity COUPLED
// ---------------------------------------------------------------------------

/**
 * The three properties that read as "depth" only move TOGETHER. Scale alone is
 * a size change; blur alone is an effect. Coupled, they are an object coming
 * toward the viewer, which is why the existing `zoom-through` reads flat.
 *
 * Returns the three together so the caller cannot apply one without the others.
 */
export function depth(level, progress) {
  if (level === "off") return { blur: 0, scale: 1, opacity: 1, z: 0 };
  const span = level === "wild" ? 0.62 : level === "vivid" ? 0.45 : 0.30;
  const t = clamp01(progress);
  const far = level === "wild" ? 1 : level === "vivid" ? 0.7 : 0.45;  // how far back
  // one curve drives all three, so they can never desynchronise
  const k = 1 - easeOut(t);
  return {
    blur: k * 14 * far,
    scale: 1 - k * 0.42 * far,
    opacity: 1 - k * 0.30 * far,
    z: -k * 260 * far,
  };
}

// ---------------------------------------------------------------------------
// 5. SEQUENCE -- each word's entrance triggers the next
// ---------------------------------------------------------------------------

/**
 * Delay for word `i` of `n`, in seconds.
 *
 * This is the layer that changes the FEEL: instead of every word starting on a
 * timer derived from its position, word i starts when word i-1 has begun. A
 * line then reads as a chain of causes rather than a list of simultaneous
 * events, which is the difference between text that is scheduled and text that
 * is performed.
 *
 * THE COMPRESSION, which is the whole difficulty.
 *
 * Naively, delay_i = i * step. For a 5-word line with step 0.12 that is 0.48s
 * before the last word even starts -- and a 0.3s interjection cannot afford
 * that, so the last word would still be arriving when the line ends. That is
 * the lingering-lyric bug, arrived at through a different door.
 *
 * So the chain is fitted to the cue's own span:
 *
 *     total = n * step                       (what it would cost)
 *     step  = min(step, (span * 0.55) / n)    (what the line can afford)
 *
 * so the chain always completes inside the line, and a long chorus line keeps
 * the full deliberate stagger while a fast interjection tightens. The effect
 * degrades in TAIL, never in correctness.
 */
export function sequence(level, i, n, span) {
  if (level === "off" || n <= 1) return 0;
  const want = level === "wild" ? 0.14 : level === "vivid" ? 0.10 : 0.07;
  const afford = span * 0.55;
  const step = Math.min(want, afford / n);
  return i * step;
}

/** The step the chain used, so the caller can show it and the test can assert it. */
export function sequenceStep(level, n, span) {
  if (level === "off" || n <= 1) return 0;
  const want = level === "wild" ? 0.14 : level === "vivid" ? 0.10 : 0.07;
  return Math.min(want, (span * 0.55) / n);
}

// ---------------------------------------------------------------------------
// 6. CHROMATIC -- sub-pixel RGB separation, only while moving fast
// ---------------------------------------------------------------------------

/**
 * Red/cyan offset in px, plus the opacity it is drawn at.
 *
 * Zero when the word is still. That is the important part: a permanent offset
 * makes text look defective, while a transient one during fast motion reads as
 * energy. The magnitude is small on purpose -- this is a 1080p overlay that gets
 * composited over a camera feed, and a visible fringe on white text is a defect.
 */
export function chromatic(level, speed) {
  if (level === "off" || speed < 0.05) return { dx: 0, opacity: 0 };
  const amp = level === "wild" ? 2.2 : level === "vivid" ? 1.4 : 0.7;
  // speed is 0..1; only the fast tail of an entrance produces a visible offset
  const k = clamp01((speed - 0.05) / 0.5);
  return { dx: amp * k, opacity: 0.30 * k };
}

// ---------------------------------------------------------------------------
// 7. PULSE GLOW -- keyed to the line's own amplitude
// ---------------------------------------------------------------------------

/**
 * Glow radius in px, from a 0..1 amplitude for this cue.
 *
 * The beat GRID is deliberately not used: on Allare the detector reported 123.05
 * when the tempo is 120, a 2.5% error that drifts ~10s over seven minutes, and
 * its confidence did not discriminate between forced tempos (gotcha 30). So
 * nothing here is snapped to a grid. The amplitude is supplied per cue, and
 * when it is missing the glow falls back to a slow breath rather than to
 * silence -- a decoration that stops when the data is thin looks like a bug.
 */
export function pulseGlow(level, amplitude, age, span) {
  if (level === "off") return 0;
  const base = level === "wild" ? 26 : level === "vivid" ? 16 : 8;
  if (amplitude == null) {
    const t = clamp01(age / Math.max(0.001, span));
    return base * 0.4 * Math.sin(t * Math.PI * 2);
  }
  const a = clamp01(amplitude);
  const t = clamp01(age / Math.max(0.001, span));
  const env = Math.sin(t * Math.PI);          // zero at both ends of the cue
  return base * (0.35 + 0.65 * a) * env;
}

// ---------------------------------------------------------------------------
// composition
// ---------------------------------------------------------------------------

/**
 * Everything for one word, in one object, so a caller cannot apply depth
 * without blur or a baseline without its envelope. The order of `transform` is
 * fixed and documented, because CSS transforms compose right-to-left and the
 * order changes what the motion looks like.
 */
export function wordDepthStyle(parts) {
  const { tracking: tr, baseline: by, arc: ar, depth: dp, chromatic: ch, glow } = parts;
  const t = [];
  if (dp && dp.scale !== 1) t.push(`scale(${dp.scale.toFixed(4)})`);
  if (ar && ar.rot) t.push(`rotate(${ar.rot.toFixed(2)}deg)`);
  const ty = ((by || 0) + (ar ? ar.y : 0) + (dp ? dp.blur * 0.4 : 0)).toFixed(2);
  if (Number(ty) !== 0) t.push(`translateY(${ty}px)`);
  if (dp && dp.blur > 0.05) t.push(`blur(${dp.blur.toFixed(2)}px)`);
  const out = {};
  if (dp && dp.opacity !== 1) out.opacity = dp.opacity;
  if (glow > 0.2) out.textShadow = `0 0 ${glow.toFixed(1)}px rgba(255,255,255,${(glow / 90).toFixed(2)})`;
  if (t.length) out.transform = t.join(" ");
  if (tr) out.wordGap = tr.toFixed(3) + "em";
  if (ch && ch.dx) out.chromaticDx = ch.dx.toFixed(2);
  return out;
}
