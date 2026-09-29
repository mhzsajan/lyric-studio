// Beat sync: snap word starts to the song's beat grid.
//
// WHY THIS IS A QUANTIZER, NOT A RE-TIMER
// ---------------------------------------
// The .lrc cue times come from Song Timer -- a human tapped them, and they are
// the ground truth for WHEN A LINE IS SUNG. word-timing.js then distributes the
// words inside a cue by character weight, which is an approximation of the
// phrasing. Beat detection must improve that approximation without fighting
// either source:
//
//   - A word may only move to a beat that is CLOSE to where the distribution
//     already put it (--beat-tol, default 0.4s). A beat far from the sung time
//     is a beat the singer did not use, and snapping to it would animate the
//     word away from the vocal.
//   - Words with no beat inside their window keep the distribution's time
//     (anchor left undefined, wordTimings falls back per-word). Mixed
//     snapped/unsnapped words are fine: wordTimings clamps starts monotonic,
//     so a word can never render before the one before it.
//
// This is the seam documented in word-timing.js ("THE SEAM FOR BEAT SYNC"):
// anchors override word STARTS only; ends stay distributed, so the karaoke
// highlight and the letter layer keep working unchanged.
//
// DETERMINISM: beats arrive as a prop (plain numbers are the one thing that is
// safe through every layer -- see render.mjs gotcha #1). The same beats.json
// produces the same anchors on every render.

import { wordTimings, splitWords } from "./word-timing.js";

/**
 * Anchor times for one cue's words, quantized to the beat grid.
 *
 * @param {{time: number, end: number, text: string}} cue
 * @param {number[]|null|undefined} beats  absolute beat times in seconds,
 *        ascending (scripts/detect_beats.py writes them)
 * @param {number} [tol=0.4]  max distance, in seconds, a word start may move
 *        to reach a beat. Larger values make words lock to the grid harder but
 *        drift further from the sung phrasing; 0 disables snapping.
 * @returns {Array<number|undefined>|undefined}  one entry per word; undefined
 *        entries fall back to the even distribution inside wordTimings.
 */
export function anchorsForCue(cue, beats, tol = 0.4) {
  if (!Array.isArray(beats) || beats.length === 0) return undefined;
  if (!(Number(tol) > 0)) return undefined;

  const words = splitWords(cue?.text);
  if (words.length === 0) return undefined;

  // The un-snapped distribution: what word-timing.js would do alone. Anchors
  // are chosen relative to THESE starts, which is what keeps the quantizer
  // honest -- a beat is only used if the word was already going to land near it.
  const base = wordTimings(cue);
  if (base.length !== words.length) return undefined;

  // Beats are ascending, so a walking pointer scans them once for all words
  // instead of a filter per word (a 7-minute song at 120 BPM is ~840 beats).
  const anchors = new Array(words.length).fill(undefined);
  let bi = 0;
  for (let wi = 0; wi < base.length; wi++) {
    const target = base[wi].start;
    // Advance to the first beat that could still be the nearest one.
    while (bi > 0 && beats[bi] > target + tol) bi--;
    while (bi < beats.length - 1 && beats[bi] < target - tol) bi++;
    // Nearest beat within the window, searched locally (the pointer above only
    // guarantees proximity, not minimality, at the edges of the window).
    let best;
    for (let k = Math.max(0, bi - 2); k <= Math.min(beats.length - 1, bi + 2); k++) {
      const d = Math.abs(beats[k] - target);
      if (d <= tol && (best === undefined || d < best.d)) best = { d, t: beats[k] };
    }
    if (best) anchors[wi] = best.t;
  }

  // A word snapped FORWARD past its own distributed end would render with a
  // zero-length slot; wordTimings' monotonic clamp fixes ordering but not
  // that. Dropping such an anchor keeps the distribution, which is always safe.
  for (let wi = 0; wi < anchors.length; wi++) {
    if (anchors[wi] !== undefined && anchors[wi] >= base[wi].end) {
      anchors[wi] = undefined;
    }
  }
  return anchors.every((a) => a === undefined) ? undefined : anchors;
}

/**
 * The most recent beat at or before t, and how long since it hit.
 * Used by Styled.jsx for the beat pulse: a visual that must be a pure function
 * of (t, beats) so a frame renders identically whenever it is captured.
 *
 * @returns {{since: number, index: number}|null} null before the first beat.
 */
export function lastBeatBefore(t, beats) {
  if (!Array.isArray(beats) || beats.length === 0) return null;
  // Binary search: beats is ascending.
  let lo = 0;
  let hi = beats.length - 1;
  if (t < beats[0]) return null;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (beats[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return { since: t - beats[lo], index: lo };
}
