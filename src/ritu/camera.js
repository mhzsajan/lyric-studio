// src/ritu/camera.js -- the fall.
//
// THE CONCEPT, AND WHY IT IS THIS MOTION
// ---------------------------------------
// Everything else in ऋतु RESOLVES: a stanza ends, a refrain returns, a verse
// closes, the song stops. The one thing that does not resolve is a season, and the
// entire song is about excluding herself from that -- "म कुनै ऋतु होइन", I am no
// season. So the camera falls forward forever and never arrives.
//
// It is also the only motion that can carry the song's actual shape. 66 seconds
// before the first word, then two 22-second breaks: 110 seconds of the 251-second
// runtime has no lyric at all. A move that cannot end is the only thing that can
// hold that silence without the screen being dead.
//
// WHAT IS FORBIDDEN HERE, AND WHY
// ------------------------------
// NO CUTS, no resets, no establishing shot, and no settling. A cut is a
// resolution, which is precisely what the song refuses, and a reset would make
// the zoom finite -- the viewer would learn that it ends, and then it is just a
// loop with a seam. Every frame must differ from the last, because a frame that
// repeats is a frame that has arrived.

/** A continuous fall: scale grows without bound and never returns. */
export function zoomAt(t, opts = {}) {
  const { base = 0.06, perSecond = 0.062, ease = 1.0 } = opts;
  // Linear in t, deliberately. An ease makes the rate change, and a change in rate
  // at a section boundary reads as a deliberate accent -- which is the effect the
  // separate `zoomAccent` is for, and mixing the two makes both weaker.
  return base + perSecond * Math.pow(Math.max(0, t), ease);
}

/**
 * The zoom, plus the song's shape.
 *
 * `zoomAccent` is the beat-quantised extra push. It comes from the detected beat
 * grid and it is the ONLY thing in this file that touches a beat, which keeps
 * gotcha 31's shape intact: beat sync may move the camera and may never move a
 * lyric, and this is the line that says so in code rather than in a comment.
 *
 * The accent decays after each beat so the pushes are distinct pulses rather than
 * a permanent extra rate, and so a fast passage does not accumulate into an
 * unusable scale.
 */
export function fallScale(t, beatTimes = [], opts = {}) {
  const { accent = 0.0, decay = 0.34 } = opts;
  let push = 0;
  // Forward, not backward, and the reason is a bug that shipped in the first
  // version: iterating from the end hit a FUTURE beat on the first iteration and
  // `break`ed. A real beat grid runs to the end of the song, so at every frame t
  // there are always beats after it -- which means the loop returned zero push on
  // every frame of the entire render and the beat sync did nothing at all, while
  // looking entirely correct in a still.
  //
  // That is gotcha 15 again, in a place where there is no gate: the frame is fine,
  // the file is fine, and the feature is simply absent.
  //
  // Forward, because the grid is sorted ascending and `dt` therefore DECREASES as
  // the index rises. That gives three regions in order, and the loop has to handle
  // all three:
  //
  //   dt too large  -- beats already faded. They come FIRST, so this must
  //                   `continue`, not `break`. Getting that backwards is the
  //                   second version of this bug: breaking on the oldest beat
  //                   means the oldest beat ends the scan and nothing is ever
  //                   accumulated.
  //   in the window -- the only ones that contribute
  //   dt negative   -- beats that have not happened yet. They come LAST and every
  //                   later beat is later still, so this one CAN break.
  //
  // Cost is O(beats) per frame. At 105 bpm over 251s that is ~440 iterations on
  // ~7500 frames, which is nothing, and a binary search to find the window would
  // be a second thing to get wrong for no measurable gain.
  for (let i = 0; i < beatTimes.length; i++) {
    const dt = t - beatTimes[i];
    if (dt > decay) continue;          // faded, and the scan continues
    if (dt < 0) break;                 // in the future, and so is everything after
    push += accent * Math.exp(-dt / (decay * 0.4));
  }
  return zoomAt(t) * (1 + push);
}

/**
 * The depth offset -- what makes it read as FALLING rather than as a zoom.
 *
 * A pure scale about the centre is a dolly-zoom, which pulls the vanishing point
 * out. What sells forward motion is the parallax: far layers move a little, near
 * layers move a lot, and they do not move at the same rate. One shared transform
 * would make the whole image scale as a flat card, which is the failure that makes
 * most procedural "infinite zoom" look like a screensaver.
 */
export function layerDepth(t, layer, opts = {}) {
  const { perSecond = 0.062, base = 0.06 } = opts;
  const scale = base + perSecond * Math.max(0, t);
  // `layer` is 0 (furthest) .. 1 (nearest). Near layers scale faster, so they
  // cross the frame sooner and the eye reads depth rather than a flat zoom.
  const k = 1 + layer * 0.85;
  return { scale: scale * k, opacity: 1 - layer * 0.15 };
}

/**
 * A slow rotation, and it is slow on purpose.
 *
 * Anything that spins at a rate the viewer can count becomes a carousel. This is
 * far below that: over the 251-second runtime a far layer turns about 14 degrees.
 * It exists to stop the geometry from lining up with itself -- without it the
 * rotated squares of the pāuwa eventually stack into a moiré grid.
 */
export function drift(t, layer, salt = 0) {
  const rate = 0.06 - layer * 0.02;
  return (t * rate + salt * 37) % 360;
}

/** The section at time t, from the lyric's own structure. */
export const RITU_SECTIONS = [
  { at: 0, name: "cold-open", until: 66.4 },
  { at: 66.4, name: "stanza-1", until: 117.6 },
  { at: 117.6, name: "break-1", until: 139.6 },
  { at: 139.6, name: "verse-1", until: 159.0 },
  { at: 159.0, name: "stanza-2", until: 213.8 },
  { at: 213.8, name: "break-2", until: 235.6 },
  { at: 235.6, name: "verse-2", until: 251.0 },
];

export function sectionAt(t) {
  for (const s of RITU_SECTIONS) if (t < s.until) return s;
  return RITU_SECTIONS[RITU_SECTIONS.length - 1];
}

/**
 * How fast the fall is moving, per section.
 *
 * The instrumental breaks are FASTER than the sung stanzas. That is the opposite
 * of the intuitive reading and it is deliberate: a break with nothing on screen
 * and a slow camera reads as a stall, whereas a break with nothing on screen and
 * a moving camera reads as travelling. The stanzas slow down because there is
 * text to read, and text to read plus fast motion is unreadable.
 */
export const SECTION_RATE = {
  "cold-open": 0.070,
  "stanza-1": 0.055,
  "break-1": 0.082,
  "verse-1": 0.052,
  "stanza-2": 0.058,
  "break-2": 0.082,
  "verse-2": 0.052,
};

/**
 * Cumulative scale -- the integral of the per-section rate, so a rate change
 * never jumps the value.
 *
 * MONOTONIC, and that is not a nicety: it is the whole concept. The piece is a
 * fall that never arrives, so the instant the scale decreases the camera has
 * "arrived" and backed up, which is a resolution -- the exact thing the song
 * refuses. Every rate in SECTION_RATE is positive precisely so this holds.
 *
 * The first version of this function was NOT monotonic: it added
 * `(s.at - last) * SECTION_RATE[s]` for each section, which applies the current
 * section's rate to the PREVIOUS section's interval. At a boundary where the rate
 * steps down from 0.082 to 0.052 the accumulated scale therefore fell, three
 * times across the song. It looked fine as a still and would have read on screen
 * as a stumble in the fall at every section change.
 *
 * So the integral is written as a proper piecewise sum: each ELAPSED section
 * contributes its own duration at its own rate, then the partial section
 * contributes the remainder. check_camera.mjs asserts monotonicity across the
 * whole runtime, because this is the one property that is invisible in a single
 * frame and load-bearing in the motion.
 */
export function scaleAt(t) {
  const clamped = Math.max(0, t);
  let scale = 0.06;
  for (const s of RITU_SECTIONS) {
    if (clamped <= s.at) break;
    const rate = SECTION_RATE[s.name] ?? 0.06;
    const end = Math.min(clamped, s.until);
    scale += (end - s.at) * rate;
    if (clamped < s.until) break;
  }
  return scale;
}