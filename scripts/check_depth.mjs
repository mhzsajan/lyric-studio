// check_depth.mjs -- invariants for the seven composition layers.
//
//   node scripts/check_depth.mjs
//
// WHY THIS IS SEPARATE FROM check_motion.mjs
// ------------------------------------------
// check_motion.mjs covers the LAYER that varies how a line arrives. This covers
// the layers that change how a line is COMPOSED, and they fail differently.
//
// The one that can actually break a deliverable is `sequence`. It deliberately
// DELAYS each word until the previous one has begun, which is the whole point --
// a line should read as a chain of causes rather than a list of simultaneous
// events. But a delayed word that starts arriving after the line has ended is
// the lingering-lyric bug, arrived at through a new door, and it is invisible
// to every existing check because nothing about it is malformed: the cue has a
// real end, the words have real timings, and the file looks fine right up until
// someone watches it.
//
// So this asserts the property that makes it safe:
//
//     the chain of delays must FIT inside the cue's own span
//
// and that it compresses rather than overruns when the span is too short.
//
// The shirorekha rule is asserted here too, per layer, because it is the
// constraint that decides which of these can exist at all: gotcha 8 measured
// that per-letter size past 0.03 snaps the headline, and a per-letter SCALE does
// the same by another road. Tracking, blur, colour, rotation and timing are all
// safe, which is why four of the seven layers are permitted. Letter spacing
// INSIDE a word is not, so tracking is applied to the gap between words only --
// and that limitation is asserted, so it cannot be quietly removed.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  tracking, baseline, arc, depth, sequence, sequenceStep, chromatic,
  pulseGlow, wordDepthStyle, DEPTH_LEVELS,
} from "../src/depth.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.join(HERE, "..", "src", "depth.js"), "utf8");

let failed = 0;
const ok = (c, label, detail = "") => {
  console.log((c ? "  PASS  " : "  FAIL  ") + label + (detail ? "   " + detail : ""));
  if (!c) failed++;
};
const N = (n) => Number(n).toFixed(4);
const finite = (o) => Object.values(o || {}).every(
  (v) => typeof v === "number" ? Number.isFinite(v) : true);

console.log("\n=== 1. every layer is finite at every level ===");
{
  let bad = null;
  for (const lvl of DEPTH_LEVELS) {
    for (const age of [0, 0.05, 0.2, 0.5, 1, 2]) {
      for (const span of [0.28, 0.6, 1.4, 3.0, 6.0]) {
        if (!finite({ t: tracking(lvl, age, span) })) { bad = `tracking ${lvl}`; break; }
        if (!finite({ b: baseline(lvl, age, span, "Allare", 3) })) { bad = `baseline ${lvl}`; break; }
        if (!finite(arc(lvl, 0.4, 0.6))) { bad = `arc ${lvl}`; break; }
        if (!finite(depth(lvl, age))) { bad = `depth ${lvl}`; break; }
        if (!finite({ g: pulseGlow(lvl, 0.5, age, span) })) { bad = `glow ${lvl}`; break; }
      }
      if (bad) break;
    }
    if (bad) break;
  }
  ok(!bad, "no layer returns NaN or Infinity at any level, age or span", bad || "");
}

console.log("\n=== 2. THE ONE THAT MATTERS: the chain fits the cue's span ===");
// A delayed word that is still arriving at the cue's end is the lingering-lyric
// bug. Asserted for the real case -- a 5-word line -- and for the pathological
// one, a 12-word interjection in 0.3s, which is where naive sequencing breaks.
{
  const CASES = [
    { n: 3, span: 0.30, why: "a fast interjection" },
    { n: 5, span: 1.20, why: "a typical line" },
    { n: 8, span: 2.60, why: "a chorus line" },
    { n: 12, span: 0.30, why: "the worst case: long line, tiny span" },
    { n: 20, span: 0.28, why: "a shout over a long word" },
  ];
  // `worst` starts at 1 (the worst possible fraction) so the comparison
  // "is this room smaller than what we have seen so far" is meaningful. Starting
  // at 0 -- the BEST possible -- means nothing is ever smaller, `worst` stays 0,
  // the check fails, and `worstAt` stays null so the message cannot say which
  // case caused it. That is a test that fails without being able to explain
  // itself, which is the worst kind.
  let worst = 1, worstAt = null;
  for (const c of CASES) {
    for (const lvl of ["calm", "vivid", "wild"]) {
      const lastDelay = sequence(lvl, c.n - 1, c.n, c.span);
      // the last word must still have time to be SEEN: a word that starts at
      // the very end of the cue is not rendered at all
      const room = c.span - lastDelay;
      if (room / c.span < worst) {
        worst = room / c.span;
        worstAt = `${lvl}, ${c.why} (n=${c.n} span=${c.span})`;
      }
    }
  }
  ok(worst > 0.15,
    "the last word always has room to be seen in its own cue",
    "worst remaining room " + (worst * 100).toFixed(1) + "%  (" + worstAt + ")");

  // And it must COMPRESS, not overrun: a short span must give a smaller step
  // than a long one, for the same word count.
  const wide = sequenceStep("wild", 5, 3.0);
  const tight = sequenceStep("wild", 5, 0.30);
  ok(tight < wide, "a short line compresses the chain instead of overrunning",
    "3.0s span -> " + N(wide) + "s step, 0.30s span -> " + N(tight) + "s step");

  // At every span, the chain plus the deepest entrance must fit.
  let overrun = null;
  for (const span of [0.25, 0.28, 0.35, 0.5, 0.8, 1.5, 3, 6]) {
    for (const n of [1, 2, 5, 9, 15, 25]) {
      const last = sequence("wild", n - 1, n, span);
      const enter = Math.min(0.55, span * 0.42);
      if (last + enter > span * 0.98) {
        overrun = `n=${n} span=${span}: last delay ${N(last)} + enter ${N(enter)}`;
        break;
      }
    }
    if (overrun) break;
  }
  ok(!overrun, "delayed words plus their entrance stay inside every span", overrun || "");
}

console.log("\n=== 3. THE SHIROREKHA RULE, per layer ===");
// Gotcha 8 is a rule about SIZE and POSITION relative to a letter's neighbours.
// These are the axes it forbids, and this asserts none of them appears.
{
  const forbidden = [];
  if (/fontSize\s*:/i.test(SRC)) forbidden.push("fontSize");
  if (/letterSpacing\s*:/i.test(SRC) && !/NEVER|not applied|forbidden/i.test(SRC)) {
    forbidden.push("letterSpacing (must be word-gap only)");
  }
  ok(forbidden.length === 0, "no layer sets per-letter size or letter spacing",
    forbidden.join(", "));

  // The word-level scale in depth() is safe BECAUSE every letter in the word
  // moves together. Assert the coupling that makes it safe: blur, scale and
  // opacity must all be non-trivial at the same progress, or it is not depth,
  // it is one effect.
  const mid = depth("wild", 0.5);
  ok(mid.blur > 0.5 && mid.scale < 0.999 && mid.opacity < 0.999,
    "depth couples blur, scale and opacity (all three move together)",
    "blur " + N(mid.blur) + " scale " + N(mid.scale) + " opacity " + N(mid.opacity));
  ok(depth("wild", 0).blur > depth("wild", 1).blur,
    "depth resolves to clear as the word settles");
}

console.log("\n=== 4. tracking is a GAP, not letter spacing ===");
{
  // The limitation, asserted so it cannot be quietly removed: tracking widens
  // the space between words. Applied inside a word it would separate one
  // syllable's letters and snap the headline, so it must never reach a word's
  // own letter nodes.
  ok(/marginLeft/.test(SRC) || /wordGap/.test(SRC),
    "tracking is applied as a margin between words");
  ok(!/letterSpacing\s*:\s*d/.test(SRC),
    "tracking is never applied as letterSpacing inside a word");
  ok(tracking("wild", 0, 1) > tracking("wild", 1, 1),
    "tracking opens wide then settles",
    N(tracking("wild", 0, 1)) + " -> " + N(tracking("wild", 1, 1)));
  ok(tracking("off", 0, 1) === 0, "tracking is genuinely off at level off");
}

console.log("\n=== 5. every layer is a pure function of its inputs ===");
// The same command must produce the same file, every time: these renders are
// used live. Math.random() anywhere in here would break that silently.
{
  ok(!/Math\.random/.test(SRC), "depth.js never calls Math.random");
  const a = baseline("wild", 0.7, 2.0, "Allare", 3);
  const b = baseline("wild", 0.7, 2.0, "Allare", 3);
  ok(a === b, "baseline is stable across calls (seeded by cue, not random)",
    N(a));
  const c1 = baseline("wild", 0.7, 2.0, "Allare", 4);
  ok(c1 !== a, "and it still differs per cue, so it is not a constant");
}

console.log("\n=== 6. chromatic is zero at rest ===");
{
  // A permanent fringe makes white text look defective on an overlay that gets
  // composited over a camera feed. It must exist only while moving.
  ok(chromatic("wild", 0).dx === 0, "no offset when the word is still");
  ok(chromatic("off", 1).dx === 0, "no offset at level off");
  const fast = chromatic("wild", 1);
  ok(fast.dx > 0 && fast.opacity > 0, "an offset appears during fast motion",
    "dx " + N(fast.dx) + " opacity " + N(fast.opacity));
  ok(fast.dx < 3, "and it is small: a visible fringe on an overlay is a defect",
    N(fast.dx) + "px");
}

console.log("\n=== 7. the glow falls back rather than dying ===");
{
  ok(pulseGlow("wild", null, 0.5, 2) > 0,
    "with no amplitude the glow breathes instead of stopping",
    "a decoration that vanishes when data is thin looks like a bug");
  ok(pulseGlow("off", 0.5, 0.5, 2) === 0, "and is genuinely off at level off");
  const quiet = pulseGlow("vivid", 0, 0.5, 2);
  const loud = pulseGlow("vivid", 1, 0.5, 2);
  ok(loud > quiet, "louder audio gives more glow", N(quiet) + " -> " + N(loud));
}

console.log(failed ? "\n  " + failed + " CHECK(S) FAILED\n" : "\n  all depth checks passed\n");
process.exit(failed ? 1 : 0);
