// Seeded, deterministic animation selection.
//
// WHY THIS IS SEEDED, NOT Math.random():
// You render this once and then use the file live. If the animation were
// random per render, the same song would come out different every time and
// your show file would stop matching the video. So every cue's style is
// derived from (masterSeed, cueIndex) — stable across renders, machines and
// re-runs, but still varied line to line so it does not feel mechanical.

/** mulberry32 — small, fast, good enough distribution for style picking. */
function seededRandom(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const STYLES = [
  // -- the original nine -------------------------------------------------------
  "fade",
  "rise",
  "pop",
  "slide-left",
  "slide-right",
  "typewriter",
  "blur-in",
  "zoom-through",
  "glow",
  // -- choreographed entrances (one-shot, settle and hold) ---------------------
  "spring",        // overshoots past 100% and settles back (Motion-style spring)
  "swing",         // drops in swinging like a pendulum released off-centre
  "flip-in",       // 3D rotateX around the horizontal axis
  "float-up",      // rises softly with a little defocus, like a bubble
  "drop-bounce",   // falls from above and bounces to rest
  "scale-up",      // grows from small, ease-out-quart
  "letter-spread", // arrives wide (scaleX) and tightens into place
  "line-wipe",     // revealed by a rising bottom-edge wipe
  "roll-in",       // spins in like a wheel and settles at rest
  "zoom-fade",     // dolly-in: starts large and near, settles back
  // -- persistent-life (keep moving while the line holds) -----------------------
  "breathe",       // slow scale oscillation for the whole hold
  "glow-pulse",    // the bloom itself breathes on a slow sine
  "pendulum",      // barely-there continuous sway around centre
];

/**
 * Per-song shuffled DEAL of styles: like a card deck, every style appears
 * exactly once before any repeats — with 22 styles a 40-cue song shows each
 * motion at least once and never the same motion twice in a row. Reshuffles
 * deterministically from the seed, so a re-render replays the same order.
 * (The old hash+multiplier pick could repeat a style back to back; the deck
 * is why this can't.)
 */
const deckCache = new Map();
export function styleSequenceFor(seedText, maxIndex) {
  const seed = String(seedText);
  let deck = deckCache.get(seed);
  if (!deck || deck.length <= maxIndex) {
    const rnd = seededRandom(hashString("deck:" + seed));
    deck = [];
    while (deck.length <= maxIndex) {
      const shoe = STYLES.slice();
      for (let i = shoe.length - 1; i > 0; i--) {
        const k = Math.floor(rnd() * (i + 1));
        [shoe[i], shoe[k]] = [shoe[k], shoe[i]];
      }
      deck.push(...shoe);
    }
    deckCache.set(seed, deck);
  }
  return deck;
}

/**
 * Pick a style for one cue. Deterministic for a given (seed, index).
 * @param {string} seedText  master seed — usually the song title
 * @param {number} index     cue index
 * @param {string} [force]   pin every cue to one style
 */
export function styleFor(seedText, index, force) {
  if (force && STYLES.includes(force)) return force;
  return styleSequenceFor(seedText, index)[index];
}

/** Per-cue jitter so timings are not perfectly uniform frame to frame. */
export function jitterFor(seedText, index) {
  const rnd = seededRandom(hashString("jit:" + seedText) + index * 40503);
  return rnd();
}

/**
 * Deterministic position for one cue in "roam" mode: each line appears at its
 * own spot (measured from the reference video the user loved: positions vary
 * line to line, biased to the upper two-thirds, x anywhere, never the bottom
 * edge). Same seed -> same layout, every render.
 */
export function positionFor(seedText, index) {
  const rnd = seededRandom(hashString("pos:" + seedText) + index * 2246822519);
  // x: width-safe band. The block is CENTERED on this anchor with a
  // maxWidth of 60vw, so an anchor below 32% (or above 68%) can push a
  // full-width line past the frame edge -- "Ritu"'s long chorus lines
  // clipped 100+ px off the left at x=20%. Keeping the anchor in the
  // middle 36% guarantees both edges of a 60vw block stay on-screen; it
  // also keeps every position meaningfully off-center, which reads better
  // than a hard clamp piling cues at 12%.
  const x = 32 + rnd() * 36;          // 32%..68% from left
  // y: upper two-thirds, top-safe. Reference never put text in the bottom
  // third. Band starts at 24% because a wrapped 2-line block (fontSize
  // 13vh x 1.32 lineHeight x 2 = ~34vh) centered on a lower anchor pushed
  // its top through the frame edge -- "Ritu"'s held chorus line lost
  // 1000+ px of glow into the top 3 rows at y=19.6%. 24% covers the
  // 2-line worst case (17vh half-height + glow); no song cue wraps to 3.
  const y = 24 + rnd() * 42;           // 24%..66% from top
  return { x, y };
}

/**
 * Deterministic font-size multiplier in [1-amount, 1+amount].
 *
 * This is the random font size (--size-mode phrase|word). Two things decide
 * how wide it may go:
 *
 *   - It must be NARROW. The point is that a line breathes, not that words
 *     shout at the audience, so amount is clamped to 0.45 (55%..145%). Past
 *     that the small words stop being readable at 1080p and the big ones
 *     collide with the frame edge.
 *   - It must be SEEDED, like every other choice here, so re-rendering the
 *     show file produces the same layout.
 *
 * @param {string} seedText  master seed — usually the song title
 * @param {number} index     cue index
 * @param {number} amount    max deviation from 1.0; 0 means no variation
 * @param {string} [salt]    distinguishes words inside one cue ("w0", "w1"...)
 */
export function sizeFor(seedText, index, amount, salt = "") {
  const a = Math.min(Math.max(Number(amount) || 0, 0), 0.45);
  if (!a) return 1;
  const rnd = seededRandom(
    hashString("size:" + salt + "|" + seedText) + index * 374761393
  );
  return 1 - a + rnd() * 2 * a;
}

export { seededRandom, hashString };
