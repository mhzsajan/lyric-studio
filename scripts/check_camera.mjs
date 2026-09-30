// check_camera.mjs -- the fall must never resolve.
//
// THE ONE PROPERTY THIS FILE EXISTS FOR
// -------------------------------------
// `scaleAt(t)` is the cumulative scale of an infinite forward fall, and it has to
// be MONOTONIC. Not smooth, not eased -- monotonic. Because the piece is a camera
// that cannot arrive, the frame where the scale decreases is the frame where the
// camera has arrived and backed up. That is a resolution, which is the single
// thing the song refuses.
//
// It is invisible in any single frame and load-bearing across four minutes. The
// first implementation was NOT monotonic and nothing else would have caught it:
// the scale was plausible in every screenshot, and the error showed up only as a
// stumble at each section boundary. So the assertion walks the entire runtime at
// frame resolution.
//
// This is the shape of gotcha 15 and gotcha 31 again, in a new place: a thing
// that renders fine and is wrong, where the only instrument that can see it is
// one that checks a property rather than a picture.

import {
  zoomAt, fallScale, scaleAt, sectionAt, layerDepth, drift,
  SECTION_RATE, RITU_SECTIONS,
} from "../src/ritu/camera.js";

let failed = 0;
const ok = (c, label, detail = "") => {
  console.log((c ? "  PASS  " : "  FAIL  ") + label + (detail ? "   " + detail : ""));
  if (!c) failed++;
};
const N = (n) => Number(n).toFixed(4);

console.log("\n=== 1. THE FALL NEVER GOES BACKWARDS ===");
{
  let prev = scaleAt(0);
  let dips = 0;
  let worst = 0;
  let worstAt = 0;
  // Frame resolution: 30fps across the whole runtime. 251s x 30 = 7530 samples,
  // which is nothing, and it is the only way to be sure a boundary does not
  // hide a dip between two frames.
  for (let f = 1; f <= 251 * 30; f++) {
    const t = f / 30;
    const v = scaleAt(t);
    if (v < prev - 1e-12) {
      dips++;
      if (prev - v > worst) {
        worst = prev - v;
        worstAt = t;
      }
    }
    prev = v;
  }
  ok(dips === 0,
    "scale is monotonic across all 7530 frames -- no resolution, no reset",
    dips === 0 ? "0 decreases" : `${dips} decreases, worst ${N(worst)} at ${worstAt.toFixed(2)}s`);

  // And specifically AT the boundaries, which is where the original bug lived.
  let boundaryDips = 0;
  for (const s of RITU_SECTIONS) {
    const before = scaleAt(s.at - 1 / 30);
    const at = scaleAt(s.at);
    if (at < before - 1e-12) boundaryDips++;
  }
  ok(boundaryDips === 0,
    "and specifically across every section boundary -- where it actually broke",
    boundaryDips === 0 ? `${RITU_SECTIONS.length} boundaries clean` : `${boundaryDips} broke`);
}

console.log("\n=== 2. every rate is positive, so monotonicity is structural ===");
{
  // The property above is a consequence of this one, and this one is checkable by
  // reading. Asserting it anyway means someone adding a section with rate 0 -- or
  // negative, which would be a typo for "slow" -- finds out here.
  const bad = Object.entries(SECTION_RATE).filter(([, r]) => !(r > 0));
  ok(bad.length === 0,
    "every section has a positive rate",
    bad.length === 0 ? Object.keys(SECTION_RATE).length + " sections" : JSON.stringify(bad));

  // Every section in the table must be REACHABLE: a section with no rate falls
  // back to 0.06 and looks fine, which is how a typo produces a subtly wrong film.
  const missing = RITU_SECTIONS.filter((s) => !(s.name in SECTION_RATE));
  ok(missing.length === 0,
    "every section has an explicit rate -- none silently defaults",
    missing.length === 0 ? "no silent 0.06 fallbacks" : missing.map((s) => s.name).join(", "));
}

console.log("\n=== 3. the breaks move FASTER than the stanzas ===");
{
  // Counter-intuitive and deliberate: a break with no lyric and a slow camera
  // reads as a stall. A break with no lyric and a moving camera reads as travel.
  const sung = ["stanza-1", "verse-1", "stanza-2", "verse-2"].map((n) => SECTION_RATE[n]);
  const breaks = ["break-1", "break-2"].map((n) => SECTION_RATE[n]);
  const slowestSung = Math.min(...sung);
  const fastestBreak = Math.max(...breaks);
  ok(fastestBreak > slowestSung,
    "an instrumental break falls faster than the slowest sung section",
    `break ${N(fastestBreak)} vs sung floor ${N(slowestSung)}`);
  ok(breaks.every((b) => b > Math.max(...sung)),
    "every break is faster than every sung section",
    breaks.map(N).join(", ") + " vs " + sung.map(N).join(", "));
}

console.log("\n=== 4. the beats move the CAMERA and only the camera ===");
{
  // Gotcha 31's shape, asserted. fallScale is the only function in the file that
  // accepts a beat grid, and it returns a SCALE. There is no beat parameter on
  // anything that could return a time, which is the structural guarantee that
  // beat sync cannot move a lyric.
  const grid = [0, 0.5, 1.0, 1.5, 2.0, 2.5];
  const plain = zoomAt(1.0);
  const pushed = fallScale(1.0, grid, { accent: 0.05 });
  ok(pushed > plain, "a beat pushes the camera's scale", `${N(plain)} -> ${N(pushed)}`);

  // And the push DECAYS, so the beats are pulses rather than a permanent extra
  // rate.
  //
  // Measured as a RATIO against the un-pushed scale, and at the same phase after a
  // beat. Two earlier versions of this assertion got it wrong in instructive
  // ways: one compared absolute scales, which grow by design and so always
  // "failed"; the next compared +0.06s after one beat against a moment that was
  // exactly ON the next beat, and correctly found a LARGER push, because being on
  // a beat is the top of the pulse. Neither was a code fault.
  const ratio = (t) => fallScale(t, grid, { accent: 0.05 }) / zoomAt(t);
  const onBeat = ratio(1.0);
  const early = ratio(1.06);
  const late = ratio(1.28);
  ok(onBeat > early && early > late,
    "the push peaks on the beat and decays after it -- pulses, not a rising offset",
    `on ${N(onBeat - 1)}, +0.06s ${N(early - 1)}, +0.28s ${N(late - 1)}`);

  // Beats outside the decay window must not change the frame. Every pad beat here
  // is at least 0.5s from t=1.0, which is outside the 0.34s window -- an earlier
  // version padded with 0.25 and 0.75, both of which are INSIDE it, and correctly
  // reported a difference that was the assertion's fault.
  const near = [1.0];
  const padded = [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0];
  ok(fallScale(1.0, near, { accent: 0.05 }) === fallScale(1.0, padded, { accent: 0.05 }),
    "beats outside the decay window cannot change the frame",
    `one beat at 1.0 vs a 7-beat grid, the rest 0.5s+ away`);

  // And the inverse, which is the assertion that would have caught the original
  // break-on-future-beat bug: a grid that runs PAST t must still push.
  const withFuture = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0];
  ok(fallScale(1.0, withFuture, { accent: 0.05 }) > zoomAt(1.0),
    "a grid extending past t still pushes -- the future beats are skipped, not fatal",
    `${N(zoomAt(1.0))} -> ${N(fallScale(1.0, withFuture, { accent: 0.05 }))}`);
}

console.log("\n=== 5. depth: the fall reads as motion, not a flat zoom ===");
{
  // A single shared scale makes the whole image scale as one flat card, which is
  // what makes most procedural infinite zoom look like a screensaver. Parallax is
  // the whole difference, so near layers MUST scale faster than far ones.
  const far = layerDepth(100, 0);
  const near = layerDepth(100, 1);
  ok(near.scale > far.scale,
    "near layers scale faster than far ones -- there is parallax",
    `far ${N(far.scale)} vs near ${N(near.scale)}`);
  ok(far.opacity > near.opacity,
    "far layers sit back, near layers sit forward",
    `far ${N(far.opacity)} vs near ${N(near.opacity)}`);

  // Drift exists to stop the rotated geometry lining up with itself into moire.
  // It must be far too slow to read as a carousel.
  const turns = drift(251, 0) / 360;
  ok(turns < 0.05,
    "drift is far below a countable rate -- under 5% of a turn over the song",
    `${N(turns)} turns over 251s`);
}

console.log("\n=== 6. sectionAt covers the whole runtime ===");
{
  let gaps = null;
  for (let t = 0; t <= 251; t += 0.05) {
    const s = sectionAt(t);
    if (!s) { gaps = gaps + t; break; }
  }
  ok(!gaps, "every moment in the runtime resolves to a section",
    gaps ? "undefined at " + gaps + "s" : "0 .. 251s");

  // Boundaries must be contiguous, or there is a frame that belongs to two
  // sections and the rate chosen for it is whichever ran first.
  let seams = [];
  for (let i = 1; i < RITU_SECTIONS.length; i++) {
    if (RITU_SECTIONS[i].at !== RITU_SECTIONS[i - 1].until) {
      seams.push(i);
    }
  }
  ok(seams.length === 0,
    "the sections are contiguous -- no frame belongs to two of them",
    seams.length === 0 ? RITU_SECTIONS.length + " sections, no seam" : "seams at " + seams.join(", "));

  ok(sectionAt(0).name === "cold-open" && sectionAt(250).name === "verse-2",
    "and the ends are the ones the lyric structure says they are",
    `${sectionAt(0).name} .. ${sectionAt(250).name}`);
}

console.log(failed
  ? `\n  ${failed} CHECK(S) FAILED\n\n`
  : `\n  the fall never resolves: 7530 frames, ${RITU_SECTIONS.length} sections, monotonic\n\n`);
process.exit(failed ? 1 : 0);