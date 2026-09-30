import { WORD_FILL } from "./word-timing.js";

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
 * So the chain is fitted to the budget it is spending from:
 *
 *     total = n * step                       (what it would cost)
 *     step  = min(step, (budget * 0.55) / n)  (what the line can afford)
 *
 * so the chain always completes inside the line, and a long chorus line keeps
 * the full deliberate stagger while a fast interjection tightens. The effect
 * degrades in TAIL, never in correctness.
 *
 * `budget` defaults to the cue's span, and the default is the right answer only
 * when the words are laid across that same span. They are not: `wordTimings()`
 * lays them across `WORD_FILL` of it and holds the rest. The chain was still
 * being sized against the full span while the words it delays had already been
 * packed into 78% of it, so the two were spending the same seconds twice.
 *
 * That is not a rounding error. On Jam Na Maya Jam's "जाम न माया जाम" -- a 1.34s
 * cue -- the chain wanted 0.42s and the last word was left 0.16s, about five
 * frames, which is a flicker and not a word. Sizing the chain against the window
 * the words actually occupy is what turns those five frames back into a readable
 * hold. Pass `budget = span * WORD_FILL` and the same chain is asked to fit the
 * space it is really in.
 */
export function sequence(level, i, n, span, budget) {
  if (level === "off" || n <= 1) return 0;
  const want = level === "wild" ? 0.14 : level === "vivid" ? 0.10 : 0.07;
  const afford = (Number.isFinite(budget) ? budget : span) * 0.55;
  const step = Math.min(want, afford / n);
  return i * step;
}

/** The step the chain used, so the caller can show it and the test can assert it. */
export function sequenceStep(level, n, span, budget) {
  if (level === "off" || n <= 1) return 0;
  const want = level === "wild" ? 0.14 : level === "vivid" ? 0.10 : 0.07;
  return Math.min(want, ((Number.isFinite(budget) ? budget : span) * 0.55) / n);
}

/**
 * The MINIMUM time a word must be on screen to count as having appeared.
 *
 * At 30 fps a word needs at least one whole frame to be seen at all, and a word
 * that appears and vanishes inside a single frame interval was never drawn --
 * that is the "some words disappear" report. 1/30s is one frame; the constant is
 * named from fps so the number is legible as what it is.
 */
export const MIN_WORD_FRAMES = 1 / 30;

/**
 * When a word actually appears, given its slot and the sequenced delay.
 *
 * `sequence()` alone cannot be trusted to keep a word inside its cue, and this is
 * the second half of why. The sequence is fitted to the cue's span in isolation:
 * it promises the CHAIN costs at most 55% of the span. It says nothing about the
 * word's own slot, which `wordTimings()` fills proportionally to sung characters
 * and therefore places the last word of a long line very close to the end. Add
 * the two and the last word starts after its cue has already ended.
 *
 * Measured on Jam Na Maya Jam, "जाम न माया जाम": four words, 1.34s cue. The last
 * word's slot opens at 1.31s, the sequence wanted to add 0.08s, and it began at
 * 1.39s -- never drawn. 42 of that song's 74 cues had at least one word in this
 * state.
 *
 * Two failures need opposite answers, which is why this is a CLAMP and not a
 * shorter delay:
 *
 *   the SEQUENCE should not add time the line cannot spare  -> it compresses,
 *     which `sequence()` already does, and
 *   the WORD's own slot may already be at the very end         -> clamped here.
 *
 * A word that starts at its cue's end has no time to be seen, so the target is
 * not `cueEnd` but `cueEnd - MIN_WORD_FRAMES`: the last instant that still shows
 * a frame of it. Returned in the same units as `wordStart`, so the caller adds
 * the returned delay to an absolute time without converting anything.
 *
 * This is deliberately not a redistribution. Pulling the last word earlier would
 * make it overlap the word before it and break the shirorekha; shrinking the
 * sequence for the whole line would penalise words that had plenty of room. The
 * delay is trimmed for exactly the word that needs it and no other.
 */
export function clampedSequence(level, i, n, span, slotOffset, budget) {
  const raw = sequence(level, i, n, span, budget);
  if (level === "off" || n <= 1) return 0;
  // A word whose own slot is already this late cannot afford any delay at all.
  const room = span - slotOffset - MIN_WORD_FRAMES;
  if (room <= 0) return 0;
  return Math.min(raw, room);
}

/**
 * The budget the chain and the word slots are both spending from: the window the
 * words are actually laid across, which is the cue's span times `WORD_FILL`.
 *
 * Both consumers need it and they must agree. `sequence()` sizes the chain and
 * `wordTimings()` places the slots; if one is handed the full span and the other
 * the fill window, they are drawing on the same seconds twice and the last word
 * pays for it. Exported as a function rather than left as arithmetic at the call
 * site so the two cannot drift apart in a future edit.
 *
 * `lastSlot` is where the final word's slot begins, relative to the cue's start.
 * Pass it and the budget also reserves a readable window for that word; omit it
 * and you get the purely aesthetic limit, which is what a caller that has not yet
 * computed the slots wants.
 */
export function chainBudget(span, fill, lastSlot) {
  const f = Number.isFinite(fill) ? Math.min(1, Math.max(0.1, fill)) : WORD_FILL;
  // Two independent limits, and taking the smaller of them is the point.
  //
  // The first is aesthetic: the chain is a staggering effect, so it should not
  // spend more than a share of the window the words occupy. Long lines keep the
  // full deliberate step and fast interjections tighten.
  //
  // The second is correctness, and it is the one the first one was missing. The
  // last word is the tightest thing on the line, because its slot is placed last
  // AND the chain delays it the most -- the two pile onto the same word. Nothing
  // else in the chain knows that, so without this term a short line with several
  // words spends its whole budget on a stagger and leaves the last word a
  // flicker. Jam Na Maya Jam's "जाम न माया जाम" is 1.34s: even at the house fill
  // and a compressed chain the last word was left 0.16s, five frames.
  //
  // Reserving a readable window for it is not the same as shortening the chain
  // globally. A long chorus line has room for both and is untouched by the
  // second limit; only lines where the two genuinely conflict are affected, and
  // on those the word being readable wins over the stagger being long.
  const aesthetic = span * f * 0.55;
  if (!Number.isFinite(lastSlot)) return aesthetic;
  const correctness = span - lastSlot - MIN_WORD_FRAMES * 10;
  return Math.max(0, Math.min(aesthetic, correctness));
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
  // `tint` is an "r, g, b" triple from src/color.js. When colour is on, the glow
  // is the word's OWN colour rather than white: a white halo around a coloured
  // word reads as a printing misregistration, and it is the giveaway that two
  // effects were applied separately instead of designed together. Null keeps the
  // original white glow, so a render with --color-mode off is byte-identical.
  const { tracking: tr, baseline: by, arc: ar, depth: dp, chromatic: ch, glow, tint } = parts;
  const t = [];
  if (dp && dp.scale !== 1) t.push(`scale(${dp.scale.toFixed(4)})`);
  if (ar && ar.rot) t.push(`rotate(${ar.rot.toFixed(2)}deg)`);
  const ty = ((by || 0) + (ar ? ar.y : 0) + (dp ? dp.blur * 0.4 : 0)).toFixed(2);
  if (Number(ty) !== 0) t.push(`translateY(${ty}px)`);
  if (dp && dp.blur > 0.05) t.push(`blur(${dp.blur.toFixed(2)}px)`);
  const out = {};
  if (dp && dp.opacity !== 1) out.opacity = dp.opacity;
  if (glow > 0.2) out.textShadow = `0 0 ${glow.toFixed(1)}px rgba(${tint || "255,255,255"},${(glow / 90).toFixed(2)})`;
  if (t.length) out.transform = t.join(" ");
  if (tr) out.wordGap = tr.toFixed(3) + "em";
  if (ch && ch.dx) out.chromaticDx = ch.dx.toFixed(2);
  return out;
}
