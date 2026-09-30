// interval_math.mjs -- is "106 ink intervals / 109 cue windows" a bug or arithmetic?
//
//   node scripts/interval_math.mjs "<song dir>"
//
// WHY
// ---
// scan_visibility.py counts ink INTERVALS and compares them to cue WINDOWS. When
// the first number is lower, the naive reading is "cues went missing" -- the
// failure the whole disappearing-words work was about, and the one this repo's
// every-frame gate is structurally blind to.
//
// But two cues sung back to back with no gap between them produce ONE continuous
// run of ink. The scan cannot tell "two cues" from "one long cue", so it counts
// one interval where there were two windows, and the difference is ARITHMETIC
// rather than loss.
//
// Which of the two it is decides whether there is a bug to fix, so it has to be
// settled before anyone goes looking. It is settled here by counting the cue
// pairs that are close enough to merge -- no pixels, no decode, just the timings
// the render was built from -- and comparing that count to the shortfall.
//
// The rule: two consecutive cues merge when the gap between them is smaller than
// one frame at the render's fps. A gap of zero is the common case in a tapped
// .lrc, where a line that runs into the next one is recorded with no space.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseLrc } from "../src/parse-lrc.mjs";

const FPS = 30;
const [songDir] = process.argv.slice(2);
if (!songDir) {
  console.error('usage: node scripts\\interval_math.mjs "<song dir>"');
  process.exit(2);
}

const start = readdirSync(songDir).find((f) => /remotion_start\.lrc$/i.test(f));
const end = readdirSync(songDir).find((f) => /remotion_end\.lrc$/i.test(f));
if (!start) {
  console.error("no .remotion_start.lrc in " + songDir);
  process.exit(2);
}
const parsed = parseLrc(
  readFileSync(path.join(songDir, start), "utf8"),
  end ? readFileSync(path.join(songDir, end), "utf8") : ""
);
const cues = parsed.cues || parsed;

const frame = 1 / FPS;
// A gap smaller than a frame cannot be seen as a gap, so the ink either side of
// it is one run. Half a frame of slack either side covers the rounding in the
// encode, which quantises cue ends to the nearest frame.
const MERGE = frame * 1.5;

let merges = 0;
const mergedPairs = [];
for (let i = 1; i < cues.length; i++) {
  const gap = cues[i].time - cues[i - 1].end;
  if (gap < MERGE) {
    merges++;
    if (mergedPairs.length < 8) {
      mergedPairs.push({
        i: i - 1,
        gap,
        a: cues[i - 1].text,
        b: cues[i].text,
      });
    }
  }
}

console.log("");
console.log(start);
console.log("  cues                    : " + cues.length);
console.log("  gaps below " + MERGE.toFixed(3) + "s (a frame at " + FPS + "fps) : " + merges);
console.log("  => intervals the scan should report : " + (cues.length - merges));
if (mergedPairs.length) {
  console.log("");
  console.log("  the closest pairs:");
  for (const p of mergedPairs) {
    console.log("    gap " + p.gap.toFixed(3) + "s   " +
      JSON.stringify(p.a) + "  ->  " + JSON.stringify(p.b));
  }
}
console.log("");
console.log("  Compare against the scan's own line. If it says N ink intervals and");
console.log("  N here matches, nothing was lost: consecutive cues simply share one");
console.log("  run of ink. If the scan reports FEWER than this, cues really did draw");
console.log("  nothing, and that is the disappearing-words bug.");
console.log("");
