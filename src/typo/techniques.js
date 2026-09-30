// src/typo/techniques.js -- the typographic techniques, as pure functions.
//
// WHY PURE, AND WHY A SEPARATE FILE
// ---------------------------------
// Every technique here is a function of (character index, character count, time
// within the cue, seed) returning a small style delta. No React, no JSX, no DOM.
//
// That is not tidiness, it is the only way these are testable at all. The bugs
// this repo has actually shipped were found by walking 7530 frames of arithmetic
// (see camera.js) and by reading the LENGTH of a row off a number rather than off
// a picture. A technique that is a JSX component can only be judged by rendering
// it; a technique that is a function can be asserted -- that its amplitude is
// bounded, that it is deterministic, that character 0 and character n-1 are not
// wildly different, that a silent line produces zeros rather than NaN.
//
// SO THE TECHNIQUES ARE DIFFERENT THINGS, NOT VARIANTS OF ONE
// -----------------------------------------------------------
// The brief is "advanced typography", and the trap is seven pieces that are all
// the same idea with the numbers changed. Each technique below has its own
// underlying idea, and each was chosen for the SONG it belongs to rather than to
// fill a slot:
//
//   ORBIT      words on concentric circles at different rates. For a song whose
//              hook is one repeated phrase -- repetition made spatial.
//   DECAY      characters lose coherence as the line ages. For "I forgot you":
//              a word that cannot hold itself together.
//   KALEIDO    the line mirrored about its own axis, halves out of phase. For
//              the dark song; and Devanagari is itself bilaterally symmetric, so
//              the effect is native to the script rather than laid over it.
//   WAVE       per-character displacement on a decaying sine. The most kinetic
//              of the set, for the most kinetic song.
//   COLUMN     type revealed by a travelling vertical mask, not faded in. For
//              the longest song, where there is time to be slow.
//
// THE ONE RULE EVERY TECHNIQUE OBEYS
// ----------------------------------
// **A technique never changes WHEN a character is on screen.** It only changes
// how that character looks once it is there. Timing comes from the cue, opacity
// comes from the cue, and the end of a line is the end of its cue.
//
// This is the same rule as gotcha 31 and as the beat-sync rule in docs/RITU.md:
// the value that decides what the viewer sees must not be reachable from anything
// that is not the cue. A technique that could delay or extend a character would
// put ink outside its window, and scan_visibility.py would fail the file. So the
// signature of every function below takes no time argument that could move a
// character in or out of existence -- only one that changes its appearance.

/** Clamp to 0..1, and turn anything non-finite into 0. */
export const unit = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
};

export const lerp = (a, b, t) => a + (b - a) * unit(t);

/**
 * A cheap deterministic hash -> 0..1, so a character's "personality" is stable.
 *
 * Not Math.random(): a technique that reshuffles every frame is not a technique,
 * it is noise, and it would make the piece unwatchable while every individual
 * frame still looked correct.
 */
export function jitter(seed, i) {
  let h = (seed | 0) ^ Math.imul(i + 1, 2654435761);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * The per-character style for a line.
 *
 * Every technique returns an object of CSS-ish deltas. The engine applies them.
 * Keeping the two apart is what lets five techniques share one line renderer, one
 * cue-timing path and one set of tests.
 *
 * @param {string} name   technique id
 * @param {object} p
 * @param {number} p.i        character index
 * @param {number} p.n        characters in the line
 * @param {number} p.q        0..1 through the CUE (never the technique's own clock)
 * @param {number} p.seed     stable per line
 * @param {number} p.amp      global amplitude 0..1, so a piece can dial it back
 * @returns {{x?:number,y?:number,rot?:number,scale?:number,blur?:number,opacity?:number}}
 */
export function technique(name, p) {
  // `q` IS SANITISED HERE, AND THAT IS LOAD-BEARING.
  //
  // Four of the five techniques use `q` in a raw multiplication, and one uses it
  // as a bound. A NaN or undefined `q` therefore propagates straight into a CSS
  // transform, and a NaN transform is not "a slightly wrong position" -- it is an
  // element the browser cannot lay out, so the character DOES NOT DRAW.
  //
  // That is the disappearing-word bug, arrived at through a new door: a word goes
  // missing because one character's transform was NaN, not because any timing was
  // wrong. scan_visibility.py would report fewer ink intervals than cue windows
  // and exit 0, exactly as it does for every other missing word.
  //
  // So the guard is here, at the single entry point, rather than repeated in five
  // functions where the fifth one would eventually be missed. `unit()` already
  // maps NaN to 0; this makes sure every technique receives what it expects.
  const q = unit(p.q);
  const n = Math.max(1, Number(p.n) || 1);
  const i = Math.max(0, Math.min(n - 1, Number(p.i) || 0));
  const safe = { ...p, q, n, i, amp: Number.isFinite(p.amp) ? p.amp : 1 };

  switch (name) {
    case "orbit": return orbit(safe);
    case "decay": return decay(safe);
    case "kaleido": return kaleido(safe);
    case "wave": return wave(safe);
    case "column": return column(safe);
    default: return {};
  }
}

export const TECHNIQUES = ["orbit", "decay", "kaleido", "wave", "column"];

/**
 * ORBIT -- characters ride a circle.
 *
 * The angle comes from the character's index, so the LINE becomes a ring rather
 * than a row, and the ring rotates as the cue ages. Radius grows toward the ends
 * so the first and last characters sit furthest out and the middle closes, which
 * is what makes it read as a ring instead of a bow.
 *
 * Amplitude decays across the cue: the ring forms and then comes apart.
 */
export function orbit({ i, n, q, seed, amp = 1 }) {
  if (n < 2) return {};
  const span = Math.PI * 1.15;                       // not a full circle: readable
  const a = -span / 2 + (i / (n - 1)) * span;
  const r = (1 - Math.cos((i / (n - 1)) * Math.PI - Math.PI / 2) * 0.5 + 0.5) * 0.5 + 0.5;
  const spin = q * 0.9 + jitter(seed, i) * 0.04;
  // The radius constant is bounded by MAX_TRAVEL.orbit.x on purpose: at 150 the
  // measured peak was 161px, over the declared 150, so a check that printed
  // "*** OVER ***" and then passed anyway let it ship. A contract the code does
  // not keep is not a contract.
  const rr = r * 132 * amp;
  const fade = 1 - unit(q) * 0.85;
  return {
    x: Math.cos(a + spin) * rr - Math.cos(a) * rr,
    y: Math.sin(a + spin) * rr * 0.42 - Math.sin(a) * rr * 0.42,
    rot: Math.sin(a + spin) * 18 * amp,
    scale: 1 + (r - 1) * 0.12 * amp,
    opacity: unit(1) * fade,
  };
}

/**
 * DECAY -- characters lose coherence as the line ages.
 *
 * This is the piece for Timilai Bhuleko: "I forgot you", so the word cannot hold
 * itself together. Each character drifts on its OWN seeded vector and blurs on
 * its OWN schedule, so the line comes apart into individually-failing letters
 * rather than dissolving as a unit -- a unit dissolve is a fade, and a fade is
 * not the same thing as forgetting.
 *
 * Late characters decay FIRST (the index runs backwards through the line), which
 * is what makes it read as erosion from one end rather than as a wipe.
 */
export function decay({ i, n, q, seed, amp = 1 }) {
  const fromEnd = (n - 1 - i) / Math.max(1, n - 1);   // 0 at the last character
  // Onset starts at 0.30, not 0.22, and the erosion bottoms out at 0.28 rather
  // than 0.08.
  //
  // Both were caught by check_typo.mjs's readability floor, and both were wrong
  // in the same way: at the original numbers the LAST character of a line was down
  // to 0.15 opacity by 70% through its own cue. Erosion is the effect, but a
  // character that has dissolved before the line has finished singing is not
  // erosion -- it is a word with a hole in it, which is the disappearing-word bug
  // wearing a deliberate effect as a disguise.
  //
  // So the decay is confined to the last third of the cue, where the line is on
  // its way out anyway and the eye is no longer reading it word by word.
  const onset = 0.30 + fromEnd * 0.40;
  const k = unit((q - onset) / 0.45);
  if (k <= 0) return {};
  const vx = (jitter(seed, i * 3 + 1) - 0.5) * 2;
  const vy = (jitter(seed, i * 3 + 2) - 0.5) * 2;
  const e = k * k * amp;                               // quadratic: it falls away
  return {
    x: vx * e * 34,
    y: vy * e * 26,
    rot: vx * e * 9,
    blur: e * 3.4,
    opacity: unit(1 - e * 0.72),
  };
}

/**
 * KALEIDO -- the line mirrored about its own vertical axis, halves out of phase.
 *
 * Devanagari is bilaterally symmetric about every letter's own centre line, and
 * the shirorekha is a single horizontal rule across the whole word -- so a
 * mirrored axis through the word is not a graphic effect laid over the script, it
 * is the script's own geometry used twice.
 *
 * Left half offsets one way, right half the other, and the two phases drift apart
 * across the cue, so the seam opens rather than staying shut.
 */
export function kaleido({ i, n, q, seed, amp = 1 }) {
  const mid = (n - 1) / 2;
  const side = i < mid ? -1 : 1;
  const dist = Math.abs(i - mid) / Math.max(1, mid);   // 0 centre, 1 at the ends
  const phase = q * 1.4;
  const vx = (jitter(seed, i) - 0.5) * 2;
  return {
    x: side * (dist * 10 * amp + Math.sin(phase + dist * 3.1) * 7 * amp) + vx * 2 * amp,
    y: Math.cos(phase + dist * 2.6) * 9 * amp * side * 0 + Math.sin(phase * 1.2 + dist * 4) * 5 * amp,
    rot: side * Math.sin(phase + dist * 2.2) * 6 * amp,
    scale: 1 + dist * 0.06 * amp,
    opacity: unit(1 - Math.abs(Math.sin(phase * 0.5 + dist * 1.7)) * 0.18),
  };
}

/**
 * WAVE -- a travelling sine, amplitude decaying through the cue.
 *
 * Phase advances with the CHARACTER INDEX, not the time, so the wave travels
 * along the word as the characters arrive rather than the whole word flapping.
 * That distinction is the difference between a wave in the text and a wobble.
 *
 * Second harmonic at half amplitude, because a pure sine reads as a mechanical
 * bob and the second harmonic is what gives it the slight asymmetry of something
 * alive.
 */
export function wave({ i, n, q, seed, amp = 1 }) {
  const k = i * 0.62;
  const env = Math.sin(Math.min(1, q) * Math.PI);      // 0 -> 1 -> 0 across the cue
  const a = amp * 26 * env;
  return {
    y: (Math.sin(k) + Math.sin(k * 2.07 + 0.6) * 0.42) * a,
    rot: Math.cos(k) * 5 * amp * env,
    scale: 1 + Math.sin(k * 1.5) * 0.05 * amp * env,
    opacity: unit(1 - q * 0.12),
  };
}

/**
 * COLUMN -- a travelling vertical mask, not a fade.
 *
 * The character is revealed by a hard edge sweeping across it, so it arrives as
 * being WIPED into existence rather than fading up. The edge is per-character and
 * staggered by index, so the sweep reads as a line of type being printed left to
 * right.
 *
 * Opacity is NOT animated here. That is deliberate: a mask is geometry, so this
 * technique returns a clip inset and the engine clips. Fading instead would be
 * easier and would be a different effect -- and the difference between "printed"
 * and "faded" is the whole point of the piece.
 */
export function column({ i, n, q, amp = 1 }) {
  const per = 0.16;                        // each character's slice of the cue
  const start = (i / Math.max(1, n)) * 0.84;
  const k = unit((q - start) / per);
  if (k <= 0) return { clip: 100 };        // fully clipped: not yet arrived
  if (k >= 1) return { clip: 0 };
  return {
    clip: (1 - k) * 100,
    x: (1 - k) * -6 * amp,
    opacity: unit(1),                       // never fades -- the mask does it
  };
}

/**
 * How far a technique can push a character, in px, for the amplitude at 1.
 *
 * Used by check_typo.mjs to bound the damage: a technique that can throw a
 * character 400px sideways is not a look, it is a bug waiting for a narrow band.
 * The numbers here are the CONTRACT, and the check asserts both this table and
 * that every technique stays inside it.
 */
export const MAX_TRAVEL = {
  orbit: { x: 150, y: 70, rot: 20 },
  decay: { x: 34, y: 26, rot: 9 },
  kaleido: { x: 18, y: 14, rot: 7 },
  wave: { x: 0, y: 40, rot: 6 },
  column: { x: 6, y: 0, rot: 0 },
};
