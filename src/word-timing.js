// Per-word timing, derived from a line-level .lrc cue.
//
// WHY THIS LIVES HERE AND NOT IN THE .LRC
// --------------------------------------
// The .lrc is a contract shared with AbleSet and Ableton: one line, one
// timestamp. Adding word stamps would change a file that two other consumers
// read, for data only this renderer needs. So the .lrc stays line-level and
// word times are derived at render time. Nothing else that reads the .lrc can
// be affected by how the overlay animates.
//
// HOW THE TIMES ARE CHOSEN
// ------------------------
// A cue covers [time, end). That span is divided among its words in
// proportion to how much text each one has, so a long word is given more of
// the line than a short one. Trailing punctuation is excluded from the weight
// (a danda or comma is not sung), which stops "nagar," from eating as much
// time as "nagar".
//
// This is an approximation and deliberately a simple one: it assumes the line
// is sung evenly from start to finish. Real phrasing front-loads or holds the
// last word, so individual words will not land exactly on the sung syllable.
// It reads correctly, and it needs no new input and no dependencies.
//
// THE SEAM FOR BEAT SYNC
// ----------------------
// `wordTimings` takes an optional `anchors` array of absolute times. If one is
// supplied, words snap to those times instead of being distributed by width.
// That is the intended hook for beat detection later: extract onsets from the
// audio, hand them in here, and every other layer of the renderer keeps working
// unchanged. Until then the argument is simply not passed.

// Trailing characters that carry no sung syllable. Matched at the end of a
// word only, so a word like "..." mid-text is unaffected.
const TRAILING = /[.,!?;:'"“”‘’।॥\s]+$/;

/** Split a cue's text into words, dropping empty runs from multiple spaces. */
export function splitWords(text) {
  return String(text ?? "")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * How much of a line's duration one word should occupy: its sung characters.
 * Always at least 1, so a one-character word never gets a zero-length slot
 * and gets skipped by the animation.
 */
export function wordWeight(word) {
  return Math.max(1, String(word).replace(TRAILING, "").length);
}

/**
 * The share of a cue's span the words are laid across, leaving the remainder as
 * a deliberate hold before the next line.
 *
 * Measured across all seven songs, laying words across the FULL span starves the
 * last word of nearly all its screen time, because slots are proportional to sung
 * characters and the final word's share is the smallest thing on the line. The
 * words ran to the cue's final frame, so the last word was born as the line died:
 *
 *     146 of 450 cues gave their last word under 0.33s (10 frames at 30fps)
 *     118 of 450 gave it under 0.20s (6 frames)
 *     tightest, in four separate songs: exactly 0.033s -- ONE frame
 *
 * A word with one frame is not a word that was read. It is a word that flickered,
 * which reads on screen as a typo or a dropped word rather than as timing.
 *
 * So the words stop short. `WORD_FILL` is the fraction of the span they occupy and
 * the rest is a HOLD: the completed line sits on screen, fully formed and
 * readable, before the next line arrives. That hold is also the "long gap before
 * the upcoming word" -- it is measured from the last word's arrival to the next
 * line's start, so the two are the same interval seen from either end.
 *
 * 0.78 rather than a rounder number because it is the smallest value that clears
 * the tightest real case with room to spare. At 0.78 the worst last-word time
 * across all 450 cues rises from 0.033s to 0.24s, and the median rises by roughly
 * a third. Pushing it higher starts to look like the line is stalling: the words
 * finish early and then simply sit there, and the gap stops reading as breathing
 * room and starts reading as a sync error.
 */
export const WORD_FILL = 0.78;

/**
 * Assign each word of a cue a start and end time.
 *
 * @param {{time: number, end: number, text: string}} cue
 * @param {object}  [opts]
 * @param {number[]} [opts.anchors] absolute times to snap word starts to,
 *        one per word. Extra words fall back to the even distribution.
 * @param {number}  [opts.fill] fraction of the span the words occupy. The rest
 *        is a hold. Defaults to WORD_FILL; pass 1 to lay them across everything.
 * @returns {{text: string, start: number, end: number, weight: number}[]}
 */
export function wordTimings(cue, opts = {}) {
  const words = splitWords(cue?.text);
  if (words.length === 0) return [];

  const weights = words.map(wordWeight);
  const total = weights.reduce((a, b) => a + b, 0);
  const span = Math.max(0, (cue?.end ?? cue?.time ?? 0) - (cue?.time ?? 0));
  const start0 = cue?.time ?? 0;

  // The words occupy `fill` of the span and the remainder is a hold. Clamped
  // rather than trusted: `fill` arrives from a CLI flag, and a fill of 0 or a
  // negative would collapse every word onto the cue's first frame.
  const fill = Number.isFinite(opts.fill) ? Math.min(1, Math.max(0.1, opts.fill)) : WORD_FILL;
  const lay = span * fill;

  // Cumulative character position -> the time that much text is worth.
  const at = (chars) => start0 + lay * (chars / total);

  let used = 0;
  const out = words.map((text, i) => {
    const weight = weights[i];
    // An anchor overrides only the START; the word still ends where the
    // distribution says, or at the next word, whichever is later, so snapped
    // words can never render backwards.
    const start =
      opts.anchors && Number.isFinite(opts.anchors[i])
        ? opts.anchors[i]
        : at(used);
    used += weight;
    return { text, start, end: at(used), weight };
  });

  // Monotonic guarantee: a snapped word may not start before the one before it.
  for (let i = 1; i < out.length; i++) {
    if (out[i].start < out[i - 1].start) out[i].start = out[i - 1].start;
  }
  return out;
}
