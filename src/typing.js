// typing.js -- the TYPED-ON reveal: letters appear left to right and STAY.
//
// WHY IT IS NOT JUST ANOTHER LETTER ANIM
// --------------------------------------
// src/anim-pools.mjs already has `wipe` (each letter clipped in from its own left
// edge) and there is a `typewriter` line style. Neither is this. Both are
// entrances that play once and are gone; typing is a CUMULATIVE reveal where
// what has been typed REMAINS, so the finished word is fully visible and the
// line reads as text that was written rather than text that appeared.
//
// The cumulative part is the whole difficulty, and it is a timing problem:
//
//   A typing reveal is nothing but letters arriving late. Word 4's last letter
//   lands after word 1's first. If the chain of per-letter delays is not fitted
//   to the cue's own span, the last letter is still arriving when the line fades
//   out -- which is the lingering-lyric bug, the worst bug in this project, and
//   it is invisible to every check that looks at structure rather than frames.
//
// So the same rule `sequence()` obeys in src/depth.js is obeyed here, for the
// same reason and with the same guarantee:
//
//     the chain of delays FITS inside the cue's span, and COMPRESSES rather
//     than overrunning when the span is too short for the letter count.
//
// THE SHIROREKHA IS NOT AT RISK, AND THAT IS THE WHOLE POINT OF THIS EFFECT
// -----------------------------------------------------------------------
// A letter that APPEARS does not move. Per-letter size past 0.03 snaps the
// headline (gotcha 8) and a per-letter scale does the same by another road, but
// opacity and a clip do neither -- so typing is one of the few effects that can
// be turned all the way up without a typesetting cost. That is why it is worth
// building separately rather than as a stronger `wipe`.
export const TYPE_LEVELS = ["off", "line", "word", "letter"];

// Per level, how the stagger is counted and how long one unit takes.
//
//   step     seconds of delay between consecutive units
//   dur      seconds for ONE unit to finish arriving
//   unit     what a unit is -- the reading grain. "letter" is the one that looks
//            like typing; "word" is words landing one at a time; "line" is the
//            whole line as a single sweep, which is a typewriter without letters.
//
// dur is deliberately short. A letter that takes half a second to arrive looks
// like it is fading in, not being typed, and it also eats the cue's span -- see
// fitDelay below.
const LEVELS = {
  line:   { step: 0.0,  dur: 0.55, unit: "line" },
  word:   { step: 0.09, dur: 0.13, unit: "word" },
  letter: { step: 0.035, dur: 0.09, unit: "letter" },
};

const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);

/**
 * How many units the whole line is, and how long the chain takes.
 *
 * @param {string} level
 * @param {number} wordCount
 * @param {number} letterCount total graphemes in the line
 * @returns {{units:number, chain:number, step:number, dur:number}}
 */
export function typingPlan(level, wordCount, letterCount) {
  const L = LEVELS[level];
  if (!L) return null;

  const units = L.unit === "letter" ? letterCount
    : L.unit === "word" ? wordCount
    : 1;

  // THE COMPRESSION. The naive chain is (units - 1) * step + dur. If that does
  // not fit the cue's span it is scaled down -- both the step and the duration,
  // proportionally -- so the reveal always finishes. A line of twenty letters in
  // a two-second cue cannot be typed at 0.035s each without running past its own
  // end, and running past its own end is the bug this file exists not to cause.
  return {
    units,
    step: L.step,
    dur: L.dur,
    chain: Math.max(0, (Math.max(1, units) - 1) * L.step + L.dur),
  };
}

/**
 * Scale a plan to fit a cue's span.
 *
 * `scale` below 1 means the reveal is running fast. It is floored so a line can
 * never compress to nothing: at the floor the effect still reads as typing,
 * because the STAGGER between units survives even when the per-unit duration
 * does not. Losing the stagger would lose the effect entirely, so it is the last
 * thing to go.
 */
export function fitDelay(level, plan, span) {
  if (!plan || !span || span <= 0) return { scale: 1, step: plan ? plan.step : 0, dur: plan ? plan.dur : 0 };
  const need = plan.chain;
  if (need <= span) return { scale: 1, step: plan.step, dur: plan.dur };
  const raw = span / need;
  const MIN = 0.28;   // the stagger must survive; the duration may not
  const scale = Math.max(MIN, raw);
  return { scale, step: plan.step * scale, dur: plan.dur * scale };
}

/**
 * One unit's state at time `t`, given the word's own arrival.
 *
 * @param {string} level
 * @param {number} unitIndex  which unit this is, counted across the whole line
 * @param {number} delay      the delay already fitted for this unit
 * @param {number} dur        the fitted per-unit duration
 * @param {number} elapsed    t - the word's own start (the caller owns that)
 * @returns {{opacity:number, clipPath:string|null}}
 */
export function typingState(level, unitIndex, delay, dur, elapsed) {
  return typingAt(level, unitIndex * delay, dur, elapsed);
}

/**
 * The same state, from an ABSOLUTE delay in seconds rather than an index.
 *
 * This exists because of a bug the index form could not express.
 * animatedWords() evaluates every letter against its OWN word's start -- and the
 * word layer MOVES words: they are spread across the cue span, and `--depth`'s
 * sequenced reveal deliberately delays each until the previous one has begun. So
 * the last word's first letter was scheduled at
 *
 *     (its own start)  +  (its position in the line) * step
 *
 * which is the sum of two delays, and only the second was ever fitted to the
 * span. Measured on Kali Kali with `--type letter --depth wild`: 15 of 48 cues
 * finished their last letter AFTER the cue ended, and the last word sat visibly
 * empty for its whole slot, waiting on a chain that had begun seconds earlier.
 *
 * It is worth being precise about why the every-frame scan did not catch it. The
 * scan measures INK against the cue window. A letter clipped to zero width draws
 * no ink, so a word that never finishes typing is INVISIBLE rather than lingering,
 * and there is nothing after the cue's end for the scan to find. This bug is a
 * MISSING word; the gate was built to catch a word that stays too long. Opposite
 * failures, and only one of them was covered.
 *
 * So the caller passes the delay as
 *
 *     max(0, letterIndex * step - wordLag)
 *
 * where `wordLag` is how late this word's own arrival is. That makes a letter's
 * absolute time max(wordStart, lineIndex * step): the chain still sweeps the line
 * in order, but never schedules a letter before the word containing it is on
 * screen. That is the only definition under which "typed on" is true.
 */
export function typingAt(level, delaySeconds, dur, elapsed) {
  if (!LEVELS[level]) return {};

  // Negative local means this unit has not started. The word layer's own
  // opacity is already handling the whole line, so an unstarted unit only needs
  // to be invisible -- and MUST be invisible, which is why this returns 0 rather
  // than "nothing": returning nothing would leave it at its parent's opacity and
  // the word would appear fully typed for a frame before it starts.
  const local = elapsed - delaySeconds;
  if (local <= 0) return { opacity: 0 };

  const p = clamp01(local / Math.max(0.001, dur));
  const inE = easeOut(p);

  // Opacity alone makes letters fade; a CLIP makes them arrive. Typing needs the
  // clip -- it is what reads as a cursor sweeping left to right rather than as a
  // word slowly brightening.
  //
  // The opacity is a plain ramp, and that is a change from a previous version
  // which multiplied it by 1.6 "so the newest letter is not fully opaque on its
  // first frame". That multiplier saturated the opacity at inE ~ 0.63, so for
  // the last third of every letter's arrival the opacity was pinned at 1 and did
  // nothing -- the whole visual was the clip, and the opacity curve was three
  // points of ramp followed by a plateau. The multiplier was invisible and the
  // plateau was misleading, so it is gone: opacity ramps smoothly and the clip
  // carries the reveal.
  return {
    opacity: inE,
    clipPath: "inset(0 " + ((1 - inE) * 100).toFixed(1) + "% 0 0)",
  };
}

/** Whether a level staggers letters rather than words or lines. */
export function levelIsLetterwise(level) {
  return LEVELS[level]?.unit === "letter";
}

/**
 * The cursor position, as a fraction along the line -- for the blinking caret
 * that makes typing unmistakable. Returns null when there is nothing to draw, so
 * a caller can skip the element rather than draw a caret at the wrong place.
 *
 * A caret is a small block, not a glyph, so it cannot touch the shirorekha: it
 * is the one part of this effect with no constraint on it at all.
 */
export function caretProgress(unitsDone, unitsTotal) {
  if (!unitsTotal) return null;
  return clamp01(unitsDone / unitsTotal);
}