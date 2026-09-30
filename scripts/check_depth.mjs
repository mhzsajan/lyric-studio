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
  pulseGlow, wordDepthStyle, clampedSequence, chainBudget, MIN_WORD_FRAMES,
  DEPTH_LEVELS,
} from "../src/depth.js";
import { wordTimings } from "../src/word-timing.js";

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

console.log("\n=== 8. A WORD MUST ACTUALLY APPEAR (the \"words disappear\" bug) ===");
// Section 2 proves the CHAIN fits the span. It passed for a long time while the
// video was visibly dropping words, because it is the wrong claim.
//
// sequence() is fitted in isolation. It promises the chain costs at most 55% of
// the span. It never looks at where any individual word's slot sits -- and
// wordTimings() places slots by sung character count, so the LAST word of a long
// line is late by construction. Add the two and the last word starts after its
// cue has ended. Clamping only against cueEnd is still not enough, because a word
// that starts exactly at the end is never drawn: that is the whole report.
//
// These are the real measurements, not a synthetic curve, and both were drawn
// from actual songs. Every one of them FAILED before clampedSequence() existed.
{
  // Measured on Jam Na Maya Jam, "जाम न माया जाम": 4 words, 1.34s cue.
  //
  // The slot is read from wordTimings rather than typed in, because a hand-copied
  // number in a timing test is a number that silently stops being true. The first
  // version hardcoded 1.31s and "passed" against a real slot of 0.975s.
  //
  // It is measured at fill:1 -- words laid across the WHOLE span -- because that
  // is the case the clamp exists for. At the house fill this cue no longer needs
  // the clamp at all, which is the point: the fill is the fix and the clamp is the
  // floor under it, for the slots fill cannot reach (anchored word times, and any
  // render that passes --word-fill 1).
  const jamCue = { text: "जाम न माया जाम", time: 100, end: 100 + 1.34 };
  const jamSpan = jamCue.end - jamCue.time;
  const jamWords = wordTimings(jamCue, { fill: 1 });
  const jamSlot = jamWords[jamWords.length - 1].start - jamCue.time;
  const rawJam = sequence("wild", jamWords.length - 1, jamWords.length, jamSpan);
  const newJam = clampedSequence("wild", jamWords.length - 1, jamWords.length, jamSpan, jamSlot);
  ok(rawJam + jamSlot > jamSpan,
    "at fill 1 the raw sequence puts the last word past the end of its cue",
    `slot ${N(jamSlot)}s + ${N(rawJam)}s = ${N(jamSlot + rawJam)}s in a ${jamSpan}s cue`);
  ok(newJam < rawJam && jamSlot + newJam <= jamSpan,
    "and the clamp is what brings it back inside",
    `delay cut ${N(rawJam)}s -> ${N(newJam)}s, starts at ${N(jamSlot + newJam)}s`);

  // And the house fill is the primary fix: it must leave the last word real time
  // WITHOUT the clamp, so a regression in the fill is caught here rather than
  // being quietly absorbed by the clamp and read as working.
  const filledSlot = wordTimings(jamCue, {})[jamWords.length - 1].start - jamCue.time;
  const rawFilled = sequence("wild", jamWords.length - 1, jamWords.length, jamSpan);
  ok(rawFilled + filledSlot < jamSpan,
    "at the house fill the last word has room even before the clamp",
    `starts ${N(filledSlot + rawFilled)}s, ${N(jamSpan - filledSlot - rawFilled)}s visible, in a ${jamSpan}s cue`);

  // The whole corpus shape, walked the way the render walks it: real wordTimings
  // slots, real cue spans, the real levels. This is the assertion that generalises
  // past the one cue that was reported.
  // Both fills are walked, because they fail differently. At fill 1 the clamp is
  // the only thing standing between a word and being invisible. At the house fill
  // the clamp should be idle, and a word can still be starved -- so the house-fill
  // rows assert a REAL reading floor, not one frame. Ten frames is the threshold
  // because below it the word reads as a flicker rather than as a word.
  const CASES = [
    { text: "जाम न माया जाम", span: 1.34 },
    { text: "काली काली हिस्सी परेकी", span: 3.07 },
    { text: "मेरो मनमा हुन्छ हलचल", span: 2.98 },
    { text: "हेर न कस्तो आँखा तरेकी", span: 3.52 },
    { text: "रिसले हो कि खुसीले..", span: 3.60 },
    { text: "बुझ्नै सकिन मैले..", span: 2.65 },
  ];
  const READABLE = 10 / 30;
  for (const [label, fill, floor] of [
    ["at fill 1, the clamp alone", 1, MIN_WORD_FRAMES],
    ["at the house fill, a word must be readable", undefined, READABLE],
  ]) {
    let lost = null;
    let worstLeft = Infinity;
    for (const level of ["calm", "vivid", "wild"]) {
      for (const c of CASES) {
        const words = wordTimings({ text: c.text, time: 100, end: 100 + c.span },
                                  fill === undefined ? {} : { fill });
        words.forEach((w, i) => {
          const slot = w.start - 100;
          const d = clampedSequence(level, i, words.length, c.span, slot,
                                     chainBudget(c.span, fill,
                                                 words[words.length - 1].start - 100));
          const start = slot + d;
          const left = c.span - start;
          if (left < worstLeft) worstLeft = left;
          if (left < floor - 1e-9) {
            lost = lost + `${level} "${c.text}" w${i}: ${N(left)}s on screen`;
          }
          if (start < slot - 1e-9) {
            lost = lost + `${level} "${c.text}" w${i}: pulled BEFORE its slot`;
          }
        });
      }
    }
    ok(!lost, label,
      lost || `${CASES.length} lines x 3 levels, tightest word had ${N(worstLeft)}s` +
              ` (floor ${N(floor)}s)`);
  }

  // The hold is real: the words must finish BEFORE the cue ends, not merely not
  // overrun it. A fill of 1 would also satisfy every assertion above while leaving
  // the reader no pause at all, which is the other half of the complaint.
  {
    const c = { text: "हेर न कस्तो आँखा तरेकी", time: 100, end: 100 + 3.52 };
    const laid = wordTimings(c, {});
    const lastEnd = laid[laid.length - 1].end - c.time;
    ok(lastEnd < 3.52 - 0.2,
      "the house fill leaves a visible hold before the next line",
      `last word ends at ${N(lastEnd)}s of a ${N(3.52)}s cue, ${N(3.52 - lastEnd)}s hold`);
    const full = wordTimings(c, { fill: 1 });
    ok(Math.abs(full[full.length - 1].end - c.time - 3.52) < 1e-9,
      "fill 1 is still reachable and still means 'no hold' -- the default is a choice",
      "last word ends exactly at the cue's end");
  }

  // The clamp must not fire on a line that had room. A clamp that trims every
  // delay would satisfy the assertion above while quietly removing --depth.
  const roomy = { span: 4.0, n: 3 };
  const unclamped = sequence("wild", 1, roomy.n, roomy.span);
  const kept = clampedSequence("wild", 1, roomy.n, roomy.span, 0.5);
  ok(Math.abs(kept - unclamped) < 1e-9,
    "a word with room keeps its FULL sequence delay -- the clamp is a clamp",
    `${N(unclamped)}s kept`);

  // off stays off, and a one-word line has no sequence to clamp.
  ok(clampedSequence("off", 2, 4, 1.34, 1.31) === 0, "off adds no delay to clamp");
  ok(clampedSequence("wild", 0, 1, 1.34, 0.9) === 0, "a one-word line has no sequence");

  // Never negative, even given a slot beyond the end -- which wordTimings can
  // produce for an anchored line, and which a negative delay would turn into a
  // word drawn BEFORE its slot.
  ok(clampedSequence("wild", 3, 4, 1.34, 5.0) === 0,
    "a slot past the end clamps to zero delay, never to a negative one");

  // And the render must actually call it. A clamp that lives in depth.js and is
  // never wired in fixes nothing; this is the gotcha-31 shape, one layer down.
  ok(/clampedSequence\(\s*\n?\s*depthLevel/.test(SRC.replace(/\s+/g, " ")) === false &&
     /clampedSequence/.test(readFileSync(path.join(HERE, "..", "src", "LyricOverlay.jsx"), "utf8")),
    "LyricOverlay calls clampedSequence, so the clamp is in the render path");
}

console.log(failed ? "\n  " + failed + " CHECK(S) FAILED\n" : "\n  all depth checks passed\n");
process.exit(failed ? 1 : 0);
