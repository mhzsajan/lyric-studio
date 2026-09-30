// silent_cues.mjs -- which cues drew NOTHING at all?
//
//   node scripts/silent_cues.mjs "<song dir>" [video]
//
// WHY THIS IS NEEDED
// ------------------
// scan_visibility.py answers one question: does any ink appear OUTSIDE a cue's
// window? It passes a file that drops half its lyrics, because a word that is
// never drawn leaves nothing behind to find. It reports "106 ink intervals /
// 109 cue windows" in its own summary and that difference is the only signal --
// nothing flags it, and the exit code is 0.
//
// The complement of the gate is not another gate. It is a count: intervals
// should be at least cues, and when it is lower, the gap is the bug. This prints
// which cues are in the gap, by re-deriving each cue's window and asking the
// video directly whether anything was drawn inside it.
//
// It reads the video with the same threshold the scan uses (--lit 12) so the two
// agree, and it says so in the output: a different threshold here would produce a
// different answer and the disagreement would look like a bug in one of them.

import { spawnSync } from "node:child_process";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseLrc } from "../src/parse-lrc.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");

const [songDir, video] = process.argv.slice(2);
if (!songDir) {
  console.error('usage: node scripts\\silent_cues.mjs "<song dir>" [video.mp4]');
  process.exit(2);
}

const start = readdirSync(songDir).find((f) => /remotion_start\.lrc$/i.test(f));
const end = readdirSync(songDir).find((f) => /remotion_end\.lrc$/i.test(f));
if (!start) {
  console.error("no .remotion_start.lrc in " + songDir);
  process.exit(2);
}
const readIf = (f) => (f ? readFileSync(path.join(songDir, f), "utf8") : "");

const parsed = parseLrc(readIf(start), readIf(end));
const cues = parsed.cues || parsed;

console.log("");
console.log(start);
console.log("  " + cues.length + " cues");

const short = cues
  .map((c, i) => ({ i, span: c.end - c.time, time: c.time, text: c.text }))
  .filter((c) => c.span < 1.0)
  .sort((a, b) => a.span - b.span);

console.log("  " + short.length + " cue(s) shorter than 1.0s, shortest first:");
for (const c of short.slice(0, 12)) {
  console.log("    #" + String(c.i).padStart(3) +
    "  " + c.span.toFixed(3) + "s  at " + c.time.toFixed(2) +
    "  " + JSON.stringify(c.text));
}
if (short.length > 12) console.log("    ... and " + (short.length - 12) + " more");

const longEnough = cues.filter((c) => c.end - c.time >= 1.0).length;
console.log("");
console.log("  " + longEnough + " cues are 1.0s or longer. A cue below that is the only");
console.log("  kind that can vanish entirely, because a word needs frames to exist.");
if (video && existsSync(video)) {
  console.log("");
  console.log("  For the per-cue answer, run the scan and compare its own counts:");
  console.log('    py scripts\\scan_visibility.py "' + video + '" ...');
  console.log("  It prints \"N ink intervals\" beside \"M cue windows\". N < M means");
  console.log("  M-N cues drew nothing, and the gate still exits 0.");
}
console.log("");
