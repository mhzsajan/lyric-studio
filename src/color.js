// color.js -- per-word and per-letter COLOUR, seeded, with four levels.
//
// WHY A SEPARATE FILE
// -------------------
// --color sets ONE colour for the whole render. Every other variation layer in
// this repo (size, motion, animation, depth) is seeded per word or per letter,
// and colour was the last thing still global. It cannot live in depth.js: depth
// is about COMPOSITION (where words sit relative to each other) and its seven
// layers are transforms, not paint. It cannot live in letters.js either, because
// letters.js owns the shirorekha SIZE rule and colour has nothing to do with
// that rule -- colour is explicitly on the ALLOWED side of it (see the note in
// depth.js and anim-pools.mjs).
//
// THE CONSTRAINT THAT SHAPES EVERYTHING HERE: THIS IS AN OVERLAY
// ---------------------------------------------------------------
// This project renders white text on black, blended Add/Screen over a
// Videosync2 camera feed in Ableton Live. That means the file is not judged as a
// picture -- it is judged as LIGHT ADDED TO A PICTURE. Two consequences, and
// both of them rule out "random RGB per letter":
//
//   1. A dark pixel adds nothing. Under Add blending, a colour's job is to be
//      BRIGHT; lightness is the channel that carries the blend. So lightness is
//      floored per level and never random -- a "random" word that comes out at
//      L=0.25 does not show up on the footage at all, which is not a look, it
//      is a word that vanished.
//   2. Full-spectrum saturation over live video is unreadable AND ugly, and it
//      fights the camera rather than sitting on top of it.
//
// So the saturation and hue ranges here are wide enough to be obviously coloured
// and narrow enough that the result still reads as a lyric overlay. That is the
// honest answer to "best colour randomisation possible" for THIS deliverable --
// a wider range is not bolder, it is a file that does not composite.
//
// DETERMINISM, AND WHY COLOUR TAKES NO TIME ARGUMENT
// ---------------------------------------------------
// Nothing in this file receives a frame time, and that is deliberate. Every other
// layer is a function of `t`, which means it must be finished by the cue's end or
// a word outlives its note -- the lingering-lyric bug, which is the worst bug in
// this project (AGENTS.md rule 1). Colour is assigned per word from a seeded
// hash and simply STAYS, so it cannot introduce that failure mode at all. There
// is nothing here for the every-frame scan to catch, which is the point.
//
// THE LETTER HUE IS A STEPPED GRADIENT, NOT A SCATTER
// ---------------------------------------------------
// "Random colour per letter" read literally is a jitter: every letter an
// independent hue, so काली comes out as four unrelated confetti dots and the
// word stops being a word. Instead the hue STEPS across the word by a seeded
// amount, with a small jitter on top. A word reads as one coloured object that
// has a gradient through it, which is the effect people are actually asking for,
// and a conjunct is never two clashing colours.
export const COLOR_LEVELS = ["off", "calm", "vivid", "wild"];

// -- schemes -----------------------------------------------------------------
//
// WHY A SCHEME EXISTS AT ALL
// --------------------------
// The first version of this file drew every word's hue independently from the
// level's range. That is "randomised" in the literal sense and it does not look
// designed: a four-word line came out with four unrelated hues and read as noise
// rather than as a palette. The level answers HOW MUCH colour; the scheme
// answers WHICH COLOURS GO TOGETHER, and a line needs both.
//
//   mono         one hue for the whole line; only lightness and saturation vary
//   analogous    hues within 35deg of the anchor -- quiet, tonal
//   triad        the anchor and two hues 120deg away
//   split        the anchor and two hues 150deg/210deg away
//   complement   the anchor and its opposite, alternating
//   rainbow      no relationship at all (the pre-scheme behaviour)
//
// Note that `rainbow` is kept rather than deleted. It is the one scheme that
// reproduces what shipped first, so `--color-scheme rainbow` is how you go back
// to a look you have already seen rather than guessing at it.
export const COLOR_SCHEMES = [
  "mono", "analogous", "triad", "split", "complement", "rainbow",
];

// The hues each scheme may use, as OFFSETS from the anchor, in degrees. Read as
// "which slots exist", not "which slot each word takes" -- the dealing is in
// linePalette(), because the order matters as much as the set.
const SCHEME_OFFSETS = {
  mono: [0],
  analogous: [-30, -15, 0, 15, 30],
  triad: [0, 120, 240],
  split: [0, 150, 210],
  complement: [0, 180],
  rainbow: null,   // null = the level's own hueSpan, no relationship imposed
};

// Per level, the four numbers that define the look. Written out rather than
// computed so that changing the look is editing a table, not reading arithmetic.
//
//   hueSpan   how far a word's hue may drift from the base, in degrees (±)
//   sat       [min, max] saturation, 0..1
//   light     [min, max] lightness, 0..1. The MIN is the blend floor (see above)
//             and is the number that keeps the text visible over footage.
//   step      [min, max] degrees of hue to advance PER LETTER across a word.
//             null means per-letter colour is off at this level.
//   glow      whether the depth glow is tinted to the word's own colour.
const LEVELS = {
  calm:  { hueSpan: 18,  sat: [0.10, 0.34], light: [0.87, 0.98], step: null,   glow: true },
  vivid: { hueSpan: 62,  sat: [0.38, 0.70], light: [0.80, 0.95], step: [8, 18],  glow: true },
  wild:  { hueSpan: 180, sat: [0.55, 0.95], light: [0.73, 0.93], step: [22, 48], glow: true },
};

const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);
const wrapHue = (h) => ((h % 360) + 360) % 360;

// FNV-1a, then one mulberry32 step. Same construction as depth.js and letters.js,
// copied on purpose rather than exported -- see the note at the top of depth.js
// about why a tenth shared helper is a wider change than it is worth.
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

/** hsl triple -> CSS string. Percentages rounded so two runs print identically. */
export function hslCss(h, s, l) {
  const hh = Math.round(wrapHue(h)) % 360;
  return `hsl(${hh}, ${(clamp(s, 0, 1) * 100).toFixed(1)}%, ${(clamp(l, 0, 1) * 100).toFixed(1)}%)`;
}

/** hsl triple -> "r, g, b" for use inside rgba(). */
export function hslRgbTriple(h, s, l) {
  const hue = wrapHue(h) / 360;
  const sat = clamp(s, 0, 1);
  const li = clamp(l, 0, 1);
  if (sat === 0) {
    const v = Math.round(li * 255);
    return `${v}, ${v}, ${v}`;
  }
  const q = li < 0.5 ? li * (1 + sat) : li + sat - li * sat;
  const p = 2 * li - q;
  const band = (t) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [band(hue + 1 / 3), band(hue), band(hue - 1 / 3)]
    .map((v) => Math.round(clamp(v, 0, 1) * 255))
    .join(", ");
}

/**
 * The colour of one word.
 *
 * @param {string} level     off | calm | vivid | wild
 * @param {string} seed      the render seed (song title)
 * @param {number} baseHue   degrees, the palette's anchor -- from --color-hue
 * @param {number} cueIndex  which line
 * @param {number} wordIndex which word in it
 * @param {object} [opts]    {scheme} -- which hues are allowed to sit together.
 *   Without one this behaves exactly as it did before schemes existed, which is
 *   what `--color-scheme rainbow` relies on.
 * @returns {{hue:number,sat:number,light:number,css:string,rgb:string}|null}
 *          null at level "off", so the caller adds no style key at all.
 */
export function wordColor(level, seed, baseHue, cueIndex, wordIndex, opts) {
  const L = LEVELS[level];
  if (!L) return null;

  const scheme = (opts && opts.scheme) || "rainbow";
  // linePalette() deals the whole line's hues at once, because the ORDER is what
  // stops two neighbouring words landing on the same colour -- which is why this
  // is not a per-word draw any more. wordIndex is the only thing it needs.
  const palette = linePalette(level, scheme, seed, baseHue, cueIndex, wordIndex + 1);
  const hue = palette[wordIndex];
  const sat = L.sat[0] + unit(`${seed}:C${cueIndex}:wSat`, wordIndex) * (L.sat[1] - L.sat[0]);
  // Lightness is clamped to the level's floor AFTER the draw, so a low draw can
  // never produce a word that adds no light. See the overlay note at the top.
  const light = clamp(
    L.light[0] + unit(`${seed}:C${cueIndex}:wLight`, wordIndex) * (L.light[1] - L.light[0]),
    L.light[0],
    L.light[1]
  );

  return { hue, sat, light, css: hslCss(hue, sat, light), rgb: hslRgbTriple(hue, sat, light) };
}

/**
 * The colour of one letter, given its word's colour. Returns the word's own
 * colour unchanged when the level has no per-letter step, so callers can use
 * the return value unconditionally.
 *
 * letterIndex is the index WITHIN the word, so the gradient runs across the word
 * and restarts on the next one.
 */
export function letterColor(level, seed, baseHue, cueIndex, wordIndex, letterIndex, word) {
  const L = LEVELS[level];
  if (!L) return null;
  if (!L.step) return word;
  // No gradient to run on a single grapheme; returning the word colour is
  // correct and is also what keeps a one-letter word from looking arbitrary.
  if (letterIndex <= 0) return word;

  const [smin, smax] = L.step;
  const step = smin + unit(`${seed}:C${cueIndex}:w${wordIndex}:step`, 0) * (smax - smin);
  const jitter = (unit(`${seed}:C${cueIndex}:w${wordIndex}:j`, letterIndex) * 2 - 1) * 6;

  const hue = wrapHue(word.hue + letterIndex * step + jitter);
  const sat = clamp(
    word.sat + (unit(`${seed}:C${cueIndex}:w${wordIndex}:lSat`, letterIndex) * 2 - 1) * 0.10,
    L.sat[0],
    L.sat[1]
  );
  // Letter lightness wanders only NARROWLY around the word's. A big per-letter
  // lightness jump would put a dim letter between two bright ones, and under Add
  // blending that letter disappears against the footage while its neighbours stay
  // -- a letter-sized dropout, which is worse than any colour effect.
  const light = clamp(word.light + (unit(`${seed}:C${cueIndex}:w${wordIndex}:lLight`, letterIndex) * 2 - 1) * 0.05, L.light[0], L.light[1]);

  return { hue, sat, light, css: hslCss(hue, sat, light), rgb: hslRgbTriple(hue, sat, light) };
}

/** Whether a level paints letters as well as words. Used to decide span nesting. */
export function levelHasLetterColor(level) {
  const L = LEVELS[level];
  return !!(L && L.step);
}

/** Whether a level tints the depth glow to the word's colour. */
export function levelTintsGlow(level) {
  const L = LEVELS[level];
  return !!(L && L.glow);
}

/**
 * The hues a line's words may take, dealt in order.
 *
 * Dealing is a seeded PERMUTATION of the scheme's slots rather than
 * `slot = wordIndex % slots.length`. The modulo version puts words 1 and 4 on
 * the same hue in a four-word line, so the line reads as a-b-a-b; a permutation
 * of the slots, cycled when there are more words than slots, gives every
 * neighbouring pair a different colour. That is the same "deal from a seeded
 * deck" idea as --word-anim mix, applied to hue.
 *
 * The cycle restart is what stops a seven-word line from ending on the hue it
 * opened with, which is the visual equivalent of a rhyme.
 */
export function linePalette(level, scheme, seed, baseHue, cueIndex, wordCount) {
  const L = LEVELS[level];
  if (!L) return null;
  if (wordCount <= 0) return [];

  const slots = SCHEME_OFFSETS[scheme] || SCHEME_OFFSETS.analogous;
  const dealt = shuffle(slots, `${seed}:C${cueIndex}:palette`);

  // rainbow keeps the level's own span, which is the pre-scheme behaviour and
  // the reason it stays a named scheme rather than a deleted branch.
  if (slots === null) {
    return Array.from({ length: wordCount }, (_, i) =>
      wrapHue(
        baseHue +
        (unit(`${seed}:C${cueIndex}:wHue`, i) * 2 - 1) * L.hueSpan
      ));
  }

  return Array.from({ length: wordCount }, (_, i) =>
    wrapHue(baseHue + dealt[i % dealt.length]));
}

/** Deterministic Fisher-Yates on a copy. Same seed, same order, every render. */
function shuffle(arr, salt) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(unit(salt, i) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * One colour for a WHOLE line.
 *
 * This exists because of a bug worth recording. Colour was originally painted on
 * per-word spans, and phrase presentations deliberately build no word spans --
 * so with `--mode mix --mix-block 8` the first three blocks of a song rendered
 * in plain white while the last three were coloured, with no error and a
 * perfectly plausible-looking file. The frame check caught it; nothing else
 * could have.
 *
 * A phrase line is ONE gesture, so one colour for it is not a fallback, it is
 * the right answer -- and it is what makes colour visible across the whole song
 * instead of only the word-unit blocks.
 */
export function lineColor(level, scheme, seed, baseHue, cueIndex) {
  const L = LEVELS[level];
  if (!L) return null;

  const slots = SCHEME_OFFSETS[scheme] || SCHEME_OFFSETS.analogous;
  const hue = slots === null
    ? wrapHue(baseHue + (unit(`${seed}:C${cueIndex}:lineHue`, 0) * 2 - 1) * L.hueSpan)
    : wrapHue(baseHue + slots[Math.floor(unit(`${seed}:C${cueIndex}:lineSlot`, 0) * slots.length)]);

  const sat = L.sat[0] + unit(`${seed}:C${cueIndex}:lineSat`, 0) * (L.sat[1] - L.sat[0]);
  const light = clamp(
    L.light[0] + unit(`${seed}:C${cueIndex}:lineLight`, 0) * (L.light[1] - L.light[0]),
    L.light[0],
    L.light[1]
  );
  return { hue, sat, light, css: hslCss(hue, sat, light), rgb: hslRgbTriple(hue, sat, light) };
}

/**
 * A linear gradient ACROSS a line, as one CSS string.
 *
 * `background-clip: text` with a transparent colour paints the gradient through
 * the glyphs without touching their geometry -- so unlike per-letter SIZE it
 * cannot step the shirorekha, and it needs no span per letter at all. It is one
 * property on the line element, which is why it is the cheapest colour effect
 * in this repo and the one that reads best over a gradient background.
 *
 * The gradient runs across the line's own width, so a short line gets a short
 * run of hues rather than the whole spectrum crushed into 200px.
 */
export function gradientCss(level, scheme, seed, baseHue, cueIndex, angleDeg = 90) {
  const L = LEVELS[level];
  if (!L) return null;
  const stops = linePalette(level, scheme, seed, baseHue, cueIndex, 4);
  if (!stops || stops.length < 2) return null;
  const sat = L.sat[0] + (L.sat[1] - L.sat[0]) * 0.5;
  const light = (L.light[0] + L.light[1]) / 2;
  return (
    "linear-gradient(" + angleDeg + "deg, " +
    stops.map((h) => hslCss(h, sat, light)).join(", ") +
    ")"
  );
}