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
// independent hue, so à¤•à¤¾à¤²à¥€ comes out as four unrelated confetti dots and the
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
  "mono", "analogous", "triad", "split", "complement", "rainbow", "duo", "primaries",
];

// The hues each scheme may use, as OFFSETS from the anchor, in degrees. Read as
// "which slots exist", not "which slot each word takes" -- the dealing is in
// linePalette(), because the order matters as much as the set.
//
// "W" is the WHITE slot, and it is not a hue. It is here because the commonest
// request for this file has been "red and white" -- and one hue plus achromatic
// is not any of the harmonic schemes, because no music theory contains it.
//
// White is also the one slot that must never take a random lightness: white is
// white. It is PINNED, and check_color.mjs asserts both halves of that -- that a
// "W" slot comes out achromatic, and that it comes out bright.
const SCHEME_OFFSETS = {
  mono: [0],
  analogous: [-30, -15, 0, 15, 30],
  triad: [0, 120, 240],
  split: [0, 150, 210],
  complement: [0, 180],
  // The anchor plus white. `--color-hue 0` gives red and white, 210 gives blue
  // and white. WHICH words get the accent is dealt rather than fixed, so a line
  // is a mix of the two and not "all red, then all white".
  duo: [0, "W"],
  // "primaries" is the request for red, orange, blue and a green tint, and it is
  // NOT `triad`. Triad is [0, 120, 240] -- red, green, blue -- and it is missing
  // the orange, which is the colour that sits between red and yellow and is the
  // one that makes the set read as a palette rather than as three traffic lights.
  // 25 degrees is the same warm step `duo:25` uses, so the orange here is
  // identical to the orange there.
  primaries: [0, 25, 120, 240],
  rainbow: null,   // null = the level's own hueSpan, no relationship imposed
};

// The white slot's exact value. Pinned, and the LIGHT end of the level's own
// range is deliberately not used: white at L=0.90 is a very light grey and would
// sit between the red and the paper instead of reading as an accent.
// `!== undefined`, NOT `||`. `rainbow` is stored as null -- "no slots, use the
// level's own span" -- and `null || analogous` is analogous. So for as long as
// schemes existed, `--color-scheme rainbow` silently rendered as analogous and
// the only symptom was that a colour scheme nobody could see had no effect. It
// was caught by check_color.mjs asserting the pre-scheme behaviour still worked,
// which is the argument for asserting that an OLD behaviour still works, not just
// that the new one does.
// "duo" IS THE ANCHOR PLUS WHITE, and white is the reason it cannot express a
// two-hue pairing. `--color-scheme duo:25` therefore reads as "the anchor, and a
// hue 25 degrees away" -- at the default anchor of 0 that is red and orange, which
// is a pairing no entry in SCHEME_OFFSETS describes, because a duo of two hues is
// just an anchor and an interval and music theory has no name for the interval.
//
// It is encoded in the scheme STRING rather than added as a second flag on purpose.
// `scheme` is threaded through wordColor, letterColor, linePalette, lineColor,
// gradientCss and slotHsl, and it is also what check_color.mjs iterates. A second
// flag would have to be added to six signatures and to every call site, and the
// place it would be forgotten is a caller that silently falls back to white --
// which is the exact failure this is meant to remove.
const DUO_OFFSET = /^duo:(-?\d+(?:\.\d+)?)$/;

/**
 * Whether a scheme paints with the HIGH-CHROMA path -- saturated colour, with the
 * lightness SOLVED from a target luminance so the result clears the readability
 * floor.
 *
 * It is not a question of whether a scheme has two slots. It is a question of
 * whether the scheme wants to be SATURATED, because the level's own ranges cannot
 * deliver that: `calm` is sat 0.10-0.34 at light 0.96, which measures luma 244 and
 * is white with a faint cast. So `primaries` -- four saturated hues -- has to take
 * this path too, or "red, orange, blue and green" arrives as four pale tints.
 *
 * The name says duo because that is where it started; it is kept rather than
 * renamed because it is exported and check_color.mjs asserts against it.
 */
export const isDuoScheme = (scheme) =>
  typeof scheme === "string" &&
  (scheme === "duo" || scheme === "primaries" || DUO_OFFSET.test(scheme));

const slotsFor = (scheme) => {
  const m = typeof scheme === "string" && DUO_OFFSET.exec(scheme);
  if (m) return [0, Number(m[1])];
  return Object.prototype.hasOwnProperty.call(SCHEME_OFFSETS, scheme)
    ? SCHEME_OFFSETS[scheme]
    : SCHEME_OFFSETS.analogous;
};

// The white slot's exact value. Pinned, and the LIGHT end of the level's own
// range is deliberately not used: white at L=0.90 is a very light grey and would
// sit between the accent and the paper instead of reading as an accent.
const WHITE_SLOT = { sat: 0, light: 1 };

// `duo` gets its OWN chroma treatment, and the shape of it is the second half of
// the red-word fix.
//
// A recognisable red is sat ~1.0. Saturation is kept high and LIGHTNESS is solved
// from a target luminance, because saturation is free and luminance is the scarce
// resource: red carries 0.2126 of the luminance budget, blue only 0.0722, so the
// same sat/light pair is three times brighter in red than in blue. Varying HSL
// lightness and hoping for the best is therefore varying the one thing that
// decides whether the word can be read.
const DUO_CHROMA = {
  sat: [0.82, 1.0],
  // How far ABOVE the floor the accent's luminance may sit. Narrow on purpose: the
  // point of the accent is to be one readable coloured word among white ones, not
  // to be the brightest thing on screen.
  lumaSpread: 0.10,
};

/** hsl -> [r,g,b] each 0..1. The one conversion in this file; everything uses it. */
export function hslToRgb01(h, s, l) {
  const sat = clamp(s, 0, 1);
  const li = clamp(l, 0, 1);
  if (sat === 0) return [li, li, li];
  const hue = wrapHue(h) / 360;
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
  return [band(hue + 1 / 3), band(hue), band(hue - 1 / 3)];
}

/**
 * Relative luminance 0..1 -- what Add blending adds, and what the scan counts.
 *
 * HUE-AWARE, AND THAT IS THE WHOLE POINT.
 *
 * The first version of this function took `{sat, light}`, hardcoded `hue = 0`, and
 * carried a comment saying hue is irrelevant because "the HSL->RGB channels are
 * permuted, and the LUMINANCE weights sum to 1 whichever way round they land".
 *
 * The weights do sum to 1. That is true and irrelevant. Luminance MULTIPLIES each
 * channel by its own weight -- 0.2126 red, 0.7152 green, 0.0722 blue -- so
 * permuting the channels changes the answer, and it changes it enormously:
 *
 *     hsl(0,   1, 0.5) = rgb(255,   0,   0)  ->  luma  54/255   (21% of white)
 *     hsl(210, 1, 0.5) = rgb(  0,  84, 255)  ->  luma  38/255   (15% of white)
 *     hsl(240, 1, 0.5) = rgb(  0,   0, 255)  ->  luma  18/255   ( 7% of white)
 *
 * Blue carries 0.0722 of the luminance, so pure blue is SEVEN TIMES darker than
 * pure red at identical HSL. A luma() that cannot tell them apart reports the
 * same number for all three, which means:
 *
 *   - the LUMA_FLOOR assertion in check_color.mjs was measuring pure red's
 *     brightness while looking at a blue swatch, so it cleared colours that are
 *     invisible; and
 *   - `--color-hue 210`, the value in this repo's own house style, produces
 *     colours roughly 40% darker than the floor check believed they were.
 *
 * That is a check that measures the wrong quantity, which is worse than no check:
 * it produced a green tick on unreadable words. It is the rule-2 failure in its
 * purest form -- an instrument that cannot fail.
 */
export function luma(hue, sat, light) {
  const [r, g, b] = hslToRgb01(hue, sat, light);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The lightness that gives `hue`/`sat` exactly `target` luminance.
 *
 * Solved by bisection rather than written out, because the answer is a different
 * quadratic for every hue -- and writing six of them is six chances to be wrong
 * about blue, which is the hue that hid the bug. Luminance rises monotonically
 * with lightness at fixed hue and saturation, so bisection cannot diverge.
 */
export function lightForLuma(hue, sat, target) {
  const want = clamp(target, 0, 1);
  if (luma(hue, sat, 1) <= want) return 1;          // even white cannot reach it
  if (luma(hue, sat, 0) >= want) return 0;
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 28; k++) {
    const mid = (lo + hi) / 2;
    if (luma(hue, sat, mid) < want) lo = mid;
    else hi = mid;
  }
  // `hi`, NOT the midpoint. The loop maintains luma(lo) < want <= luma(hi), so hi
  // is the only value guaranteed to MEET the target. Returning (lo+hi)/2 -- which
  // is what this did first -- lands a hair under it often enough to matter: every
  // dark hue in the batch came out at 158/255 against a floor of 0.62 (=158.1),
  // and the floor assertion failed on its own output by three hundredths of a
  // level. A solver that returns a value just below the number it was asked for
  // is a solver that will eventually be blamed for the caller's arithmetic.
  return hi;
}

// THE FLOOR, AND WHY IT IS NOT 40 ANY MORE
// -----------------------------------------
// The old floor was 40/255, on the reasoning that a saturated red is "plainly
// visible over footage". Measured on the shipped files, it was not:
//
//     Jam Na Maya Jam, t=189s   the red actually drawn  rgb(240, 0, 0)   luma  51
//     Jam Na Maya Jam, t=180s   the red actually drawn  rgb(240,32,48)   luma  77
//     Kali Kali,       t=309s   the red actually drawn                   luma  78
//     Kali Kali,       t=306s   the red actually drawn                   luma 128
//
// 51/255 is a fifth of white. A Devanagari glyph at a fifth of white, on black,
// loses every thin stroke -- the i-matra above the shirorekha, the e-matra, the
// joins in a conjunct, the descender of a ja or a kha. What survives is the thick
// core of each consonant, and a thick core is a DIFFERENT LETTER. That is the
// reported "the red word makes the sentence incorrect": the word was not merely
// dim, it was misread.
//
// The previous note here also said, correctly, that any floor above 54/255
// "forbids red by arithmetic" -- and then set the floor to 40, which is the same
// conclusion reached by giving up. The arithmetic is right and the conclusion was
// wrong. A saturated hue CANNOT be made brighter by scaling it: red is already at
// 255 in its own channel. The only lever that raises luminance is DESATURATION --
// mixing toward white. So the floor is enforced by raising LIGHTNESS until the
// hue clears it, and a "red" that clears a readability floor is a light red.
//
// That is a real trade and it is not hidden here: at luma 0.62 a hue-0 red is
// rgb(255,149,149), which reads as coral. Anyone who needs a true primary red must
// either accept a dim word or accept a pink one. There is no third option, and
// pretending otherwise is what produced luma 51.
export const LUMA_FLOOR = 0.62;

/**
 * Raise `light` until the colour clears LUMA_FLOOR. Applied to EVERY colour this
 * file emits, at EVERY hue, so no scheme can opt out of readability by choosing a
 * dark hue.
 *
 * A white slot is exempt: white is pinned at light 1.0 and is already the
 * brightest thing in the frame, and "fixing" it would mean darkening white.
 */
export function ensureReadable(hue, sat, light, floor = LUMA_FLOOR) {
  if (clamp(sat, 0, 1) === 0) return clamp(light, 0, 1);
  const l = clamp(light, 0, 1);
  if (luma(hue, sat, l) >= floor) return l;
  return lightForLuma(hue, sat, floor);
}

// Per level, the four numbers that define the look. Written out rather than
// computed so that changing the look is editing a table, not reading arithmetic.
//
//   hueSpan   how far a word's hue may drift from the base, in degrees (Â±)
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
  let slot = palette[wordIndex];

  // --color-accent: HOW OFTEN the accent colour is dealt at all.
  //
  // The request this answers is "I don't want the whole sentence coloured, I
  // want one word or letter sometimes". At accent 1.0 a `duo` line deals red and
  // white in equal measure, which is a coloured sentence with white in it -- not
  // an accent. Below 1.0 most words come out white and the accent is the
  // exception, which is what makes it read as one word picked out rather than a
  // palette applied.
  //
  // The draw is seeded per word, so a given song always accents the same words.
  // A line's accent words therefore stay put across re-renders and across the
  // two versions of a song, which matters: a version that moved its accent words
  // would not be the same song twice.
  const accent = opts && Number.isFinite(opts.accent) ? Math.min(Math.max(opts.accent, 0), 1) : 1;
  if (accent < 1 && !isWhiteSlot(slot)) {
    const keep = unit(`${seed}:C${cueIndex}:w${wordIndex}:accent`, 0);
    if (keep > accent) slot = "W";
  }

  // The slot may be the achromatic WHITE one, in which case slotHsl pins it and
  // there is no random lightness to draw. Everything else draws sat and light
  // from the level's range as before.
  const hsl = slotHsl(slot, L, `${seed}:C${cueIndex}:w${wordIndex}`, baseHue, "", wordIndex, scheme);
  const { hue, sat, light } = hsl;
  const white = isWhiteSlot(slot);

  return {
    hue, sat, light, white, duo: isDuoScheme(scheme),
    css: hslCss(hue, sat, light),
    rgb: hslRgbTriple(hue, sat, light),
  };
}

/**
 * The colour of one letter, given its word's colour.
 * Returns the word's own
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

  // A WHITE word keeps its letters white, and this is not an oversight -- it is
  // the whole reason the white slot is flagged rather than merely being
  // sat=0. You cannot step a gradient out of white without leaving white: the
  // first letter would pull toward the anchor hue at the level's minimum
  // saturation and the word would read as a gradient that starts white, which is
  // the rainbow-across-a-word effect the `duo` scheme exists to avoid. White is
  // an ACCENT here, and an accent is flat.
  if (word && word.white) return word;

  const [smin, smax] = L.step;
  const step = smin + unit(`${seed}:C${cueIndex}:w${wordIndex}:step`, 0) * (smax - smin);
  const jitter = (unit(`${seed}:C${cueIndex}:w${wordIndex}:j`, letterIndex) * 2 - 1) * 6;

  const hue = wrapHue(word.hue + letterIndex * step + jitter);
  // Letters wander around the WORD's own sat and light, and are clamped to
  // whichever range produced that word -- not blindly to the level's. Clamping to
  // the level is how a real red at light 0.50 comes back from letter 3 as pink at
  // light 0.80, and the word visibly fades toward the top of its own gradient.
  const band = word.duo ? DUO_CHROMA : L;
  const sat = clamp(
    word.sat + (unit(`${seed}:C${cueIndex}:w${wordIndex}:lSat`, letterIndex) * 2 - 1) * 0.10,
    band.sat[0],
    band.sat[1]
  );
  // Letter lightness wanders only NARROWLY around the word's. A big per-letter
  // lightness jump would put a dim letter between two bright ones, and under Add
  // blending that letter disappears against the footage while its neighbours stay
  // -- a letter-sized dropout, which is worse than any colour effect.
  //
  // For a `duo` word there is no band to clamp to -- DUO_CHROMA deliberately has
  // no `light` range, because the word's lightness was SOLVED from its target
  // luminance and clamping a solved value to an HSL range would undo the solve.
  // So a duo letter wanders around the word's solved lightness and is then put
  // back through the same readability floor, which is what stops a letter from
  // being the dim one.
  //
  // The NON-duo branch had the same hole and it was worse, because the level's
  // light range is not a floor: it is a range chosen so letters contrast with
  // EACH OTHER, and nothing in it promises the word stays readable. Clamping a
  // letter into [0.73, 0.93] at hue 210 and sat 0.95 lands it at luma 145, under
  // the 158 floor, while its own word sits at 160 -- one dim letter inside a
  // readable word. check_color.mjs now walks letters and found it; before that it
  // walked words only and passed.
  const wander = (unit(`${seed}:C${cueIndex}:w${wordIndex}:lLight`, letterIndex) * 2 - 1) * 0.05;
  const light = clamp(
    word.light + wander,
    band.light ? band.light[0] : 0,
    band.light ? band.light[1] : 1
  );

  return { hue, sat, light: ensureReadable(hue, sat, light), white: false,
           css: hslCss(hue, sat, light), rgb: hslRgbTriple(hue, sat, light) };
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

  const slots = slotsFor(scheme);

  // rainbow keeps the level's own span, which is the pre-scheme behaviour and
  // the reason it stays a named scheme rather than a deleted branch. It is
  // checked BEFORE the shuffle, because shuffling `null` is the whole crash --
  // and it crashed the moment rainbow started actually being honoured, which is
  // the argument for a fix being tested on the path it fixes rather than only on
  // the path it was written for.
  if (slots === null) {
    return Array.from({ length: wordCount }, (_, i) =>
      wrapHue(
        baseHue +
        (unit(`${seed}:C${cueIndex}:wHue`, i) * 2 - 1) * L.hueSpan
      ));
  }

  const dealt = shuffle(slots, `${seed}:C${cueIndex}:palette`);
  return Array.from({ length: wordCount }, (_, i) => dealt[i % dealt.length]);
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
 * Turn one palette SLOT into an hsl triple.
 *
 * Every consumer of a palette goes through this, because the "W" slot is not a
 * hue and three call sites each working it out separately is three places to
 * forget. It is exported for check_color.mjs, which asserts the white slot
 * really is white.
 */
export function slotHsl(slot, L, seed, baseHue, saltTag, n, scheme) {
  if (slot === "W") {
    return { hue: wrapHue(baseHue), sat: WHITE_SLOT.sat, light: WHITE_SLOT.light };
  }
  const hue = wrapHue(baseHue + slot);

  // `duo`'s chromatic slot keeps its own SATURATION range -- a real red is
  // sat ~1.0 -- and is then LIGHTENED until it clears the floor. Drawing a
  // lightness directly and hoping it lands bright enough is what produced luma 51:
  // the seeded range spanned both readable and unreadable, and nothing checked
  // which end a given word got.
  //
  // So the seeded variation moved into the quantity that actually matters. `duo`
  // varies its TARGET LUMINANCE across a narrow band above the floor, and solves
  // lightness from that. Two red words in a line still differ, and every one of
  // them is readable, which drawing HSL lightness could not promise.
  if (isDuoScheme(scheme)) {
    const sat = DUO_CHROMA.sat[0] + unit(saltTag + ":sat", n) *
      (DUO_CHROMA.sat[1] - DUO_CHROMA.sat[0]);
    const target = LUMA_FLOOR + unit(saltTag + ":luma", n) * DUO_CHROMA.lumaSpread;
    return { hue, sat, light: lightForLuma(hue, sat, target) };
  }

  const range = L;
  const sat = range.sat[0] + unit(saltTag + ":sat", n) * (range.sat[1] - range.sat[0]);
  const light = clamp(
    range.light[0] + unit(saltTag + ":light", n) * (range.light[1] - range.light[0]),
    range.light[0],
    range.light[1]
  );
  // And the same floor for every other level and scheme, so `--color-hue 210`
  // cannot produce a word seven times darker than red without anybody noticing.
  return { hue, sat, light: ensureReadable(hue, sat, light) };
}

/** Whether a slot is the white one. Small, but three call sites need it. */
export const isWhiteSlot = (slot) => slot === "W";

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

  const slots = slotsFor(scheme);
  // A phrase line is ONE colour, so it takes ONE dealt slot -- including the
  // white one, which is how a phrase line becomes white half the time rather
  // than never.
  const slot = slots === null
    ? wrapHue(baseHue + (unit(`${seed}:C${cueIndex}:lineHue`, 0) * 2 - 1) * L.hueSpan)
    : slots[Math.floor(unit(`${seed}:C${cueIndex}:lineSlot`, 0) * slots.length)];
  const hsl = slotHsl(slot, L, `${seed}:C${cueIndex}:line`, baseHue, "", 0, scheme);
  const { hue, sat, light } = hsl;

  return {
    hue, sat, light,
    white: isWhiteSlot(slot),
    css: hslCss(hue, sat, light),
    rgb: hslRgbTriple(hue, sat, light),
  };
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
    // Through slotHsl, so a white slot in the palette becomes an actual WHITE
    // gradient stop rather than hsl(0, 62%, 83%) -- which is pink. That was a real
    // bug on the first run of `duo --color-gradient`: a red-to-pink line, and the
    // obvious reading was that the white slot was broken rather than
    // reinterpreted as a hue.
    stops.map((slot, i) => {
      const h = slotHsl(slot, L, `${seed}:C${cueIndex}:grad${i}`, baseHue, "", i, scheme);
      return hslCss(h.hue, h.sat, h.light);
    }).join(", ") +
    ")"
  );
}