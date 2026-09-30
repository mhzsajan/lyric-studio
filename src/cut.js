// cut.js -- the NEWSPARE / CUT-PAPER look: every word is a clipping.
//
// WHY A SEPARATE FILE
// -------------------
// depth.js is transforms that keep the words in formation -- tracking, baseline
// drift, arc, coupled depth, a sequenced reveal. This file is the opposite
// instinct: it takes the formation APART. Each word becomes a separate piece of
// paper at its own angle, at its own height, at its own size, with its own torn
// edge, and the line stops being typeset and becomes assembled by hand.
//
// It is separate because it is judged against a different rule. Everything in
// depth.js has to look deliberate and never damage a glyph; this file is allowed
// to be visibly irregular. Mixing the two in one file is how the irregular
// version ends up quietly tidied until it is just depth.js again.
//
// WHAT IS SAFE, AND THE ONE MEASUREMENT THIS FILE EXISTS TO TRUST
// --------------------------------------------------------------
// The shirorekha -- Devanagari's continuous headline bar -- is what limits all
// of this (gotcha 8). The bar is continuous ACROSS a word and already broken at
// word boundaries, so:
//
//   WORD level   rotate, translate, scale, clip-path  -> ALL SAFE, freely.
//                A rotated word is a piece of paper. A clipped word loses ink
//                only at its own ends, where the bar ends anyway.
//
//   LETTER level rotation only, and BOUNDED.
//                A per-letter rotate displaces that letter's headline against
//                its neighbours -- the same damage as per-letter size, by
//                another road. Unlike size there was no measured ceiling for it,
//                so LETTER_ANGLE_CAP below is the value to distrust: it is a
//                first estimate and the honest next step is to render one word
//                at 2/4/6/10 degrees and look at the bar, exactly as
//                LETTER_SIZE_CAP was found. It is set low on purpose until
//                somebody has looked.
//
//   LETTER level translate and clip  -> NOT OFFERED AT ALL.
//                Both cut the bar. There is no small amount of "a bit" here.
//
// WHY THE DARK-PAPER LOOK IS ABSENT
// ---------------------------------
// This project blends Add/Screen over live video, so the file is light added to
// a picture (see color.js for the full argument). A dark clipping on grey newsprint
// adds NOTHING under Add blending -- it would be invisible, not dark. So the
// palette here is light, high-contrast clippings with ragged edges, which is
// also the cleanest cut-paper look there is.
export const CUT_LEVELS = ["off", "word", "letter"];

// Per level, the four numbers that define the look.
//
//   angle     max |rotation| in degrees
//   lift      max |vertical offset| in px, as a fraction of the font size
//   tear      how ragged the clip-path edge is, 0..1
//   scale     max extra scale, on top of --size-var (a clipping is a different
//             physical size of paper)
//
// The WORD geometry is ONE table, and `letter` inherits it. That is not
// tidiness, it is the guarantee: `letter` is `word` plus a per-letter rotation,
// and a second table for `letter` would let the two levels drift apart until
// `--cut letter` stopped being `--cut word` with an extra component and became a
// second look nobody chose. scripts/check_cut.mjs asserts the inheritance.
const WORD_GEOMETRY = { angle: 4.5, lift: 0.055, tear: 0.55, scale: 0.10 };
const LEVELS = {
  word: WORD_GEOMETRY,
  // `letter` is the same word geometry plus the per-letter component below.
  letter: WORD_GEOMETRY,
};

const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function unit(salt, n) {
  let a = (hashString(salt) + Math.imul(n + 1, 2654435761)) | 0;
  a = Math.imul(a ^ (a >>> 15), 1 | a);
  a = (a + Math.imul(a ^ (a >>> 7), 61 | a)) ^ a;
  return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
}

/**
 * The per-word clipping state.
 *
 * @param {string} level   off | word | letter
 * @param {string} seed    render seed
 * @param {number} cueIndex
 * @param {number} wordIndex
 * @param {number} fontSize  the size actually being drawn, so `lift` is in real px
 * @returns {{angle:number,lift:number,scale:number,clipPath:string|null}|null}
 */
export function wordCut(level, seed, cueIndex, wordIndex, fontSize = 105) {
  const L = LEVELS[level];
  if (!L) return null;

  const angle = (unit(`${seed}:C${cueIndex}:w${wordIndex}:angle`, 0) * 2 - 1) * L.angle;
  const lift = (unit(`${seed}:C${cueIndex}:w${wordIndex}:lift`, 0) * 2 - 1) * L.lift * fontSize;
  const scale = 1 + unit(`${seed}:C${cueIndex}:w${wordIndex}:scale`, 0) * L.scale;

  return {
    angle,
    lift,
    scale,
    // -- ARROWED HERE ON PURPOSE --
    // The bar is meant to sit low, at the base of the line, like type set on a
    // baseline. It is drawn as a polygon across the word's own box, not as a
    // clip, so it removes no ink: a tear that clipped through the glyphs would
    // nibble the very headline bar this file is careful about.
    // See tearBar() for why it is not in the transform at all.
  };
}

/**
 * The bar that reads as a cut edge UNDER a word.
 *
 * An irregular quadrilateral in the word's own coordinate space, which is what
 * a pair of scissors does to the bottom of a clipping. Returned as a background
 * IMAGE rather than a clip-path on purpose: clip-path REMOVES ink, and the ink
 * in question is the shirorekha.
 *
 * `depth` is 0..1 and scales how ragged it is; at 0 it is a straight edge and at
 * 1 the steps are as tall as a fifth of the word. The top edge is left flat so
 * the shape never reaches the glyphs' bodies.
 */
export function tearBar(level, seed, cueIndex, wordIndex, fontSize = 105) {
  const L = LEVELS[level];
  if (!L || L.tear <= 0) return null;
  const h = Math.max(1, fontSize * 0.075);
  const steps = 7;
  const depth = L.tear;
  const salt = `${seed}:C${cueIndex}:w${wordIndex}:tear`;

  // Left to right along the bottom, then back along a straight top edge. The
  // points are in percentages so this is resolution-independent.
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * 100;
    // The outermost points are pulled UP so the shape ends in a point rather
    // than a step, which is what makes it read as torn instead of as a saw.
    const edge = i === 0 || i === steps ? 0 : depth * (0.25 + unit(salt, i) * 0.75);
    pts.push(`${x.toFixed(2)}% ${(100 - edge * 100).toFixed(2)}%`);
  }
  pts.push("100% 100%", "0% 100%");

  return {
    // A near-black bar with a faint light top edge: under Add blending the dark
    // part is invisible (correct -- that part is a shadow), and the light edge is
    // the one pixel that reads as the cut.
    //
    // `clipPath` here is the BAR's own shape, and it is safe because the bar is
    // drawn on a sibling element BEHIND the text. It is not applied to the word
    // span: a clip-path removes ink, and the ink at the bottom of a word is the
    // shirorekha. See the note in LyricOverlay.jsx where the sibling is rendered.
    backgroundImage:
      "linear-gradient(180deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.30) 18%, rgba(0,0,0,0.55) 46%, rgba(0,0,0,0) 100%)," +
      "linear-gradient(180deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.45) 100%)",
    backgroundSize: `100% ${h.toFixed(1)}px, 100% ${(h * 1.15).toFixed(1)}px`,
    backgroundPosition: "bottom left, bottom left",
    backgroundRepeat: "no-repeat",
    clipPath: "polygon(" + pts.join(", ") + ")",
  };
}

/**
 * The per-letter component: ROTATION ONLY.
 *
 * No lift and no clip, because both cut the headline bar -- see the note at the
 * top of this file. The angle is bounded by LETTER_ANGLE_CAP, which is
 * deliberately below the word-level angle: a whole word rotating is a clipping
 * turning, and a whole LETTER rotating is a letter coming off the headline.
 */
export function letterCut(level, seed, cueIndex, wordIndex, letterIndex) {
  const L = LEVELS[level];
  if (!L || level !== "letter") return null;

  const angle = clamp(
    (unit(`${seed}:C${cueIndex}:w${wordIndex}:l${letterIndex}:angle`, 0) * 2 - 1) * LETTER_ANGLE_CAP,
    -LETTER_ANGLE_CAP,
    LETTER_ANGLE_CAP
  );
  return { angle, transform: `rotate(${angle.toFixed(2)}deg)` };
}

/**
 * The measured ceiling for a per-letter rotate.
 *
 * THIS NUMBER IS NOT MEASURED. It is a deliberately conservative first estimate,
 * and it is the one thing in this file I would not trust without looking. The
 * rule it has to satisfy is gotcha 8's: the shirorekha must stay visually
 * continuous.
 *
 * To measure it: render one word at 2, 4, 6 and 10 degrees, crop the headline,
 * and look at the boundary between each rotated letter and its neighbour. At 2
 * degrees the step should be sub-pixel at 1080p. If 2 looks too timid, this
 * number is wrong and raising it is the fix.
 */
export const LETTER_ANGLE_CAP = 2.0;

/** Whether a level paints letters as well as words. */
export function levelHasLetterCut(level) {
  return level === "letter";
}

/**
 * The word-level transform string.
 *
 * COMPOSED, never assigned over. Three things may want to write `transform` on
 * one word span -- this, --size-drift, --motion and the word's own entrance --
 * and the rule is that the word's own entrance stays the OUTERMOST gesture,
 * because rightmost applies first. Two writers to one key where the second
 * replaces the first is gotcha 12, and this is the third time it has come up.
 */
export function wordCutTransform(cut) {
  if (!cut) return "";
  const t = [];
  if (cut.angle) t.push(`rotate(${cut.angle.toFixed(2)}deg)`);
  if (cut.scale && cut.scale !== 1) t.push(`scale(${cut.scale.toFixed(4)})`);
  // translateY goes LAST of the three, so the rotation and scale happen about
  // the word's own centre and the lift moves the finished piece.
  if (cut.lift) t.push(`translateY(${cut.lift.toFixed(2)}px)`);
  return t.join(" ");
}