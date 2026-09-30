// anim-pools.mjs -- the names of every animation effect, in ONE place.
//
// WHY THIS IS ITS OWN FILE
// ------------------------
// render.mjs used to validate `--word-anim` against a HARDCODED array while
// LyricOverlay.jsx declared the real one. The two could not see each other, so
// every effect added to the pool was rejected by the validator before it could
// render -- the pool grew, the gate silently became a wall, and the error
// message ("Use off, reveal, karaoke or pulse") was the only clue. That is a
// duplicate list, which is a duplicate list.
//
// So: the arrays live here, a plain .mjs that both a Node CLI and a .jsx can
// import, and the error message is generated from the same array it validated
// against. It cannot now be wrong in a way the message does not show.
//
// This file holds NAMES and their documentation. The implementations stay in
// LyricOverlay.jsx, because they need React and the easing helpers, and
// check_animation.mjs reads those bodies out of the source to assert the
// shirorekha rule holds for each one.

// -- per-WORD effects ---------------------------------------------------------
//
// A word effect is a WHOLE-WORD transform, so every letter in the word moves
// together and Devanagari's shirorekha (the headline bar running across the
// top) stays continuous. That is why this pool may scale, rotate and swing
// freely and the letter pool may not.
export const WORD_ANIMS = [
  "off",          // no per-word animation: the line moves as one block
  "reveal",       // rises into place and holds
  "karaoke",      // newest word brightest, settling back (the house style)
  "pulse",        // a small scale pop as it lands
  "flip",         // rotates in on the X axis, 3D
  "swing",        // pendulum, with a counter-swing on landing
  "drop",         // falls from above and bounces
  "zoom",         // starts large and near, settles back
  "spin",         // rolls in and stops
  "cascade",      // later and longer than its neighbours: a wave down the line
  "glow",         // unlit, then lit; stays lit
  "wobble",       // two decaying oscillations: reads as spoken, not placed
  "slide-left",   // drifts in from the left
  "slide-right",  // drifts in from the right
  "mix",          // DEAL: each word gets a different effect (see WORD_MIX_POOL)
];

/**
 * The deck `--word-anim mix` deals from.
 *
 * `mix` exists because a karaoke line reads as monotonous NOT because of the
 * effect but because every word in the line does the same thing: five words all
 * rising together is one gesture repeated five times. Dealing per word turns it
 * into five different gestures in sequence, which is what makes a line look
 * performed rather than typeset.
 *
 * `karaoke` is deliberately absent: its defining behaviour is that the newest
 * word is brightest and then settles BACK, which reads poorly as a one-shot
 * entrance. `off` is absent because dealing "no animation" into one word of a
 * line is just a gap.
 */
export const WORD_MIX_POOL = [
  "reveal", "drop", "flip", "swing", "zoom",
  "pulse", "cascade", "glow", "slide-left", "slide-right",
  "wobble", "spin",
];

// -- per-LETTER effects --------------------------------------------------------
//
// A letter effect may touch opacity, translate, rotate, blur, clipPath and
// glow. It may NOT scale, and may not set fontSize above 0.03.
//
// Gotcha 8 measured that: at 0.03 the shirorekha is still continuous, at 0.05
// it starts to separate, at 0.08 it reads as a broken word. A per-letter SCALE
// reaches the same damage by a different road -- it moves that letter's headline
// relative to its neighbours -- so scaling is out of this pool, not merely
// capped. `pop` is the one exception and it predates the rule; it is reported
// by scripts/check_animation.mjs rather than silently allowed.
export const LETTER_ANIMS = [
  "off",
  "fade",        // opacity
  "rise",        // up from below
  "pop",         // scale -- the original house style; see the note above
  "wipe",        // clipped in from its own left edge
  "drop",        // falls in from above
  "slide-left",  // drifts in from the left
  "slide-right", // drifts in from the right
  "tilt",        // rotates upright
  "tumble",      // the long way round, with spin left on landing
  "blur-in",     // out of focus into focus
  "glow-in",     // dark, then lit: reads as switching on
  "unfurl",      // vertical wipe, top to bottom
];

// -- the STYLES pool (line entrances) ------------------------------------------
// Kept here for the same reason: render.mjs --style has to validate against the
// real list, and styles are declared in src/animations.js.
export const STYLE_ANIMS = [
  "fade", "rise", "pop", "slide-left", "slide-right", "typewriter",
  "blur-in", "zoom-through", "glow",
  "spring", "swing", "flip-in", "float-up", "drop-bounce", "scale-up",
  "letter-spread", "line-wipe", "roll-in", "zoom-fade",
  "breathe", "glow-pulse", "pendulum",
];
