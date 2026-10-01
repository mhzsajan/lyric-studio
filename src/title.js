// title.js -- find the song's own title word inside the lyric, and mark it.
//
// WHY
// ---
// "Whenever the title word appears -- the Allare word in Nepali or English --
// highlight it, every time it appears."
//
// It is a small idea and it needs to be exactly right, because a highlight that
// fires on the wrong word is worse than no highlight: the audience is being told
// that word matters, and it does not.
//
// THREE THINGS THAT ARE EASY TO GET WRONG, AND ARE HERE BECAUSE THEY WERE
//
// 1. EXACT MATCH, NOT SUBSTRING. The lyric contains "तिमीलाई" and the title is
//    "तिमीलाई भुलेको". A substring test marks every "तिमीलाई" in the song, which is
//    a word that merely appears in the title, not the title. A title word is a
//    WHOLE word of the line that equals a whole word of the title.
//
// 2. THE TITLE CARRIES PUNCTUATION THE LYRIC DOES NOT. "अल्लारे," with a comma,
//    "तिमीलाई भुलेको," with a comma and a trailing ः. So both sides are stripped to
//    bare letters before comparing. Without this the title word never matches
//    anything, silently, and the feature looks like it does nothing.
//
// 3. DEVANAGARI DOES NOT USE SPACES THE WAY LATIN DOES, so the split is on
//    whitespace AFTER normalisation, and the comparison is on the normalised form.
//    A title that is one token ("अल्लारे") is one token to match.
import { splitGraphemes } from "./letters.js";

/**
 * Reduce a word to comparable letters: no punctuation, no trailing ः ँ ऽ, collapsed
 * spaces, lower case for Latin.
 *
 * It strips characters rather than punctuation classes, because the Devanagari
 * trailing marks are the ones that actually differ between a title line and a lyric
 * line, and a class-based strip misses them.
 */
export function normToken(s) {
  return String(s == null ? "" : s)
    // Devanagari: the vowel signs and marks that attach to the END of a word and
    // are written differently in a title than in a sung line.
    .replace(/[ँंःऽ।॥]/g, "")
    // Latin and general punctuation.
    .replace(/[.,!?;:'"()\[\]{}<>—–…]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** The title's own words, normalised. ["timilaI bhuleko,"] -> ["तिमीलाई","भुलेको"] */
export function titleTokens(title) {
  return String(title == null ? "" : title)
    .split(/\s+/)
    .map(normToken)
    .filter(Boolean);
}

/**
 * Which words of `text` are title words.
 *
 * Returns a boolean per whitespace-separated word, in order. A word is marked when
 * its normalised form EQUALS a title token. The comparison is exact because a
 * partial match is a different word -- see note 1 at the top.
 *
 * `title` may be a string or an array of strings, so a caller that knows both the
 * Nepali and the romanised title (a transliteration, a folder name) can pass both
 * and have either one match.
 */
export function titleWordFlags(text, title) {
  const words = String(text == null ? "" : text).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const sources = Array.isArray(title) ? title : [title];
  const tokens = new Set();
  for (const t of sources) for (const tok of titleTokens(t)) tokens.add(tok);
  if (!tokens.size) return words.map(() => false);
  return words.map((w) => tokens.has(normToken(w)));
}

/**
 * The style a title word gets.
 *
 * COLOUR plus GLOW, and the glow is a `textShadow` rather than a filter or a
 * transform, which is a deliberate choice about where the risk is. This project has
 * lost a day to per-syllable transforms detaching Devanagari matras, so an effect
 * that only ADDS PAINT is worth a great deal: `text-shadow` cannot move a glyph, so
 * it cannot detach a matra, and it cannot change the shirorekha. A `filter: glow()`
 * or a `scale()` would be the two things that reintroduce the fault.
 *
 * The scale is per WORD, which is the same reason: a word is one span, and scaling
 * a span cannot disturb the syllables inside it relative to each other.
 *
 * The accent hue is passed in rather than chosen here, so the title word uses the
 * render's own palette and the file stays free of colour decisions.
 */
export function titleStyle(hueCss, scale = 1.14) {
  return {
    color: hueCss,
    // Two shadows: a tight bright one for the edge, a wide soft one for the halo.
    // One shadow cannot do both -- a tight one is a glow and a wide one is a fog.
    textShadow: `0 0 10px ${hueCss}, 0 0 26px ${hueCss}66, 0 3px 16px rgba(0,0,0,0.85)`,
    fontSize: (scale * 100).toFixed(1) + "%",
    // So the enlarged word cannot be clipped by the row it sits in.
    display: "inline-block",
  };
}

/** Whether any word of `text` is a title word -- the cheap pre-check. */
export function hasTitleWord(text, title) {
  return titleWordFlags(text, title).some(Boolean);
}

export { splitGraphemes };
