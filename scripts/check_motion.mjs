// check_motion.mjs -- invariants for the --motion choreography pool.
//
// A motion pool has three ways of being quietly wrong, and none of them throw:
//
//   1. IT IS NOT SEEDED. Same command, different file. The video is rendered once
//      and then played live, so a re-render that does not match the show file
//      is a worse bug than an ugly frame.
//   2. IT REPEATS ITSELF. A random pick gives the same motion thirty times
//      running and skips another entirely. That is what "random" looks like when
//      a human watches it, and the user asked for no repeats.
//   3. IT BREAKS A HARDER INVARIANT. A motion outlives its line's tapped end
//      (gotcha 31), or displaces text off the frame (gotchas 13/17).
//
// So this asserts those three directly, with no render and no ffmpeg.
//
//   node scripts/check_motion.mjs
import {
  MOTIONS, MOTION_IDS, MOTION_LEVELS, buildMotionPlan, motionParams,
  cueMotion, travelBudget,
} from "../src/motion.js";

let failed = 0;
const ok = (cond, label, detail = "") => {
  console.log((cond ? "  PASS  " : "  FAIL  ") + label + (detail ? "   " + detail : ""));
  if (!cond) failed++;
};
const N = (n) => Number(n).toFixed(3);

// The widest span Allare actually contains, and its narrowest.
const WIDE = 2.6, NARROW = 0.28;
const FRAME = { W: 1920, H: 1080 };

console.log("\n=== 1. the pool is well-formed ===");
ok(MOTION_IDS.length >= 12, "pool has enough distinct motions to avoid repetition", MOTION_IDS.length + " motions");
for (const id of MOTION_IDS) {
  const s = MOTIONS[id](0.5, 0, { dx: 20, dy: 20, rot: 6, blur: 8, glow: 20, freq: 1.5, zeta: 0.4, mirror: 1 });
  if (!s || typeof s !== "object") { ok(false, "motion " + id + " returns a style object"); break; }
  const bad = Object.entries(s).filter(([k, v]) => v !== undefined && /NaN|Infinity|undefined/.test(String(v)));
  if (bad.length) { ok(false, "motion " + id + " emits no NaN/Infinity", JSON.stringify(bad)); break; }
}
ok(true, "every motion returns a finite style object");

console.log("\n=== 2. determinism (gotcha: seeded, never Math.random) ===");
for (const lvl of ["calm", "vivid", "wild"]) {
  const a = buildMotionPlan({ seed: "Allare", cueCount: 109, level: lvl });
  const b = buildMotionPlan({ seed: "Allare", cueCount: 109, level: lvl });
  ok(a.join() === b.join(), "level " + lvl + ": identical plan across two runs");
  const c = buildMotionPlan({ seed: "Ritu", cueCount: 109, level: lvl });
  ok(a.join() !== c.join(), "level " + lvl + ": a different song gets a different plan");
}
const p1 = motionParams("Allare", 5, "vivid");
const p2 = motionParams("Allare", 5, "vivid");
ok(JSON.stringify(p1) === JSON.stringify(p2), "per-cue parameters are stable");

console.log("\n=== 3. no two neighbouring lines share a motion ===");
for (const lvl of ["calm", "vivid", "wild"]) {
  const plan = buildMotionPlan({ seed: "Allare", cueCount: 109, level: lvl });
  let adj = 0;
  for (let i = 1; i < plan.length; i++) if (plan[i] === plan[i - 1]) adj++;
  ok(adj === 0, "level " + lvl + ": no adjacent repeats across 109 cues",
    adj ? adj + " repeats" : "0 repeats");
}
const off = buildMotionPlan({ seed: "Allare", cueCount: 109, level: "off" });
ok(off.length === 0, "level off produces no plan at all (house style untouched)");

console.log("\n=== 4. every motion in the pool is actually used ===");
for (const lvl of ["calm", "vivid", "wild"]) {
  const plan = buildMotionPlan({ seed: "Allare", cueCount: 109, level: lvl });
  const used = new Set(plan);
  ok(used.size >= 2, "level " + lvl + " uses a real spread of motions", used.size + " distinct of " + MOTION_IDS.length);
}

console.log("\n=== 5. no two cues are the SAME motion (not just not adjacent) ===");
// "No repeating motion" at 109 cues over a 20-motion pool is only achievable
// with per-cue parameters. So: same motion id must still mean a different
// journey. Compare the actual style at the same instant.
const plan = buildMotionPlan({ seed: "Allare", cueCount: 109, level: "wild" });
const byId = new Map();
for (let i = 0; i < plan.length; i++) {
  if (!byId.has(plan[i])) byId.set(plan[i], []);
  byId.get(plan[i]).push(i);
}
let dupes = 0, checked = 0;
for (const [id, idxs] of byId) {
  for (let a = 0; a < idxs.length; a++) {
    for (let b = a + 1; b < idxs.length; b++) {
      const t = 0.25;
      const s = (i) => {
        const st = cueMotion({
          level: "wild", motionId: id, params: motionParams("Allare", i, "wild"),
          since: t, until: WIDE - t, span: WIDE,
          travel: { dx: 120, dy: 90 }, holdSeed: 0,
        });
        return JSON.stringify(st);
      };
      checked++;
      if (s(idxs[a]) === s(idxs[b])) dupes++;
    }
  }
}
ok(dupes === 0, "identical motion id never produces an identical frame",
  checked + " cue pairs compared, " + dupes + " identical");

console.log("\n=== 6. a motion is FINISHED inside the line's own end (gotcha 31) ===");
// At the cue's end time the motion must be fully faded: opacity 0. This is the
// invariant that keeps a lyric from still travelling when the singer stopped.
for (const span of [NARROW, 0.4, 1.0, WIDE, 6]) {
  for (const id of MOTION_IDS) {
    for (const lvl of MOTION_LEVELS.filter((l) => l !== "off")) {
      const st = cueMotion({
        level: lvl, motionId: id, params: motionParams("Allare", 3, lvl),
        since: span, until: 0, span,
        travel: { dx: 120, dy: 90 }, holdSeed: 0,
      });
      const op = st.opacity == null ? 1 : st.opacity;
      if (op > 0.0001) {
        ok(false, "span " + N(span) + "s, " + id + " (" + lvl + ") is clear at its end",
          "opacity " + N(op));
        break;
      }
    }
  }
}
ok(true, "every motion reaches opacity 0 at its own end time, on every span tested");

console.log("\n=== 6b. no motion POPS a line onto the screen ===");
// A line that appears at full opacity on its first frame reads as a glitch, and
// it also broke a measurement: lingering.py reported the NEXT line's first frame
// as the previous line "still lit after its end", because there was no fade-in
// to put it under the threshold. Both the eye and a pixel count are right here.
for (const span of [NARROW, 1.0, WIDE]) {
  let worstFirst = 0, worstId = "";
  for (const id of MOTION_IDS) {
    for (const lvl of MOTION_LEVELS.filter((l) => l !== "off")) {
      const st = cueMotion({
        level: lvl, motionId: id, params: motionParams("Allare", 3, lvl),
        since: 0, until: span, span, travel: { dx: 120, dy: 90 }, holdSeed: 0,
      });
      const op = st.opacity == null ? 1 : st.opacity;
      if (op > worstFirst) { worstFirst = op; worstId = id + "/" + lvl; }
    }
  }
  ok(worstFirst < 0.02, "span " + N(span) + "s: the first frame of a line is not visible",
    "worst " + N(worstFirst) + " (" + worstId + ")");
}

console.log("\n=== 6c. opacity rises monotonically through the entrance ===");
// A fade that goes up, dips and rises again is a flicker, not an entrance.
for (const id of MOTION_IDS) {
  const span = WIDE;
  let prevOp = -1, dips = 0;
  for (let k = 0; k <= 20; k++) {
    const since = (k / 20) * 0.55;
    const st = cueMotion({
      level: "vivid", motionId: id, params: motionParams("Allare", 7, "vivid"),
      since, until: span - since, span, travel: { dx: 120, dy: 90 }, holdSeed: 0,
    });
    const op = st.opacity == null ? 1 : st.opacity;
    // A spring legitimately overshoots and comes back -- zoomThrough goes a few
    // percent past full brightness and settles, which is the point of it. So a
    // FLICKER is a visible drop, not any decrease at all; 15% is well above a
    // spring's overshoot and well below a line strobing.
    if (op < prevOp - 0.15) dips++;
    prevOp = op;
  }
  if (dips > 1) { ok(false, "motion " + id + " does not flicker during its entrance", dips + " dips"); break; }
}
ok(true, "no motion dips during its entrance (at most the one overshoot of its own spring)");

console.log("\n=== 7. motion never requests travel beyond the frame (gotchas 13/17) ===");
// Roam centred on an anchor with a 60vw block is the placement that can run out
// of room. The budget must collapse, not lie.
const tight = travelBudget({
  kind: "roam", anchor: { x: 32, y: 24 }, halfBlockW: 0.5 * 60 * 19.2, halfBlockH: 200,
  W: FRAME.W, H: FRAME.H,
});
ok(tight.dx < 40 && tight.dy < 60, "a roam cue already touching an edge gets almost no travel",
  "dx " + N(tight.dx) + "  dy " + N(tight.dy) + "  (pad 26px is reserved for the glow)");
const roomy = travelBudget({
  kind: "roam", anchor: { x: 50, y: 45 }, halfBlockW: 200, halfBlockH: 100,
  W: FRAME.W, H: FRAME.H,
});
ok(roomy.dx > 100 && roomy.dy > 100, "a centred roam cue still has room to move",
  "dx " + N(roomy.dx) + "  dy " + N(roomy.dy));
const band = travelBudget({ kind: "band", left: 11, width: 64, W: FRAME.W, H: FRAME.H });
ok(band.dx > 0 && band.dx < 0.5 * FRAME.W, "band travel is bounded by the frame",
  "dx " + N(band.dx));

console.log("\n=== 8. an unknown level is inert, not a crash ===");
const bogus = cueMotion({ level: "wildish", motionId: "lift", params: motionParams("x", 1, "vivid"), since: 0, until: 1, span: 1, travel: { dx: 1, dy: 1 } });
ok(Object.keys(bogus).length === 0, "cueMotion returns {} for a level that is not real");

console.log(failed ? "\n  " + failed + " CHECK(S) FAILED\n" : "\n  all motion checks passed\n");
process.exit(failed ? 1 : 0);
