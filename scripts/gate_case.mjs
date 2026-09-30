// gate_case.mjs -- run render.mjs on a song whose FILENAME may be Nepali.
//
//   node scripts/gate_case.mjs "<song dir>" --legacy-font <ttf>
//   node scripts/gate_case.mjs "<song dir>" --font-file <ttf>
//
// WHY THIS FILE EXISTS
// --------------------
// Three of the seven songs are named in Devanagari. Passing those through a shell
// mangles them -- PowerShell turned "अल्लारे.remotion_start.lrc" into
// "???????.remotion_start.lrc" -- and the result reads like a broken gate, a
// broken song, or a broken font, when what actually happened is that the ARGUMENT
// was destroyed before the program ever saw it.
//
// Three of those four readings are wrong, and a wrong diagnosis costs more than
// the bug it was chasing. So: spawn with an args ARRAY, never a command string,
// let Node pass the path as bytes, and let this script find the .lrc itself so
// the caller never has to type a Devanagari filename at all.
//
// It is a harness for proving the GATE refuses, which is worth having separately
// from rendering: the refusals are the claims that matter, and a claim nobody
// re-checks is a claim that quietly stops being true.

import { spawnSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");

const [songDir, ...rest] = process.argv.slice(2);
if (!songDir) {
  console.error("usage: node scripts\\gate_case.mjs \"<song dir>\" <render.mjs flags>");
  process.exit(2);
}

function pick(re) {
  return readdirSync(songDir).find((f) => re.test(f));
}
const start = pick(/remotion_start\.lrc$/i);
const end = pick(/remotion_end\.lrc$/i);
const audio = pick(/\.(mp3|wav|m4a)$/i);

if (!start) {
  console.error("no .remotion_start.lrc in " + songDir);
  process.exit(2);
}

// --report-only is the default because proving a REFUSAL is this script's job
// and a refusal costs seconds. An --out means the caller wants the file, so the
// report is not the deliverable and must not be requested on top of it.
const wantsRender = rest.includes("--out");
const args = [
  path.join(ROOT, "render.mjs"),
  path.join(songDir, audio || "missing-audio"),
  path.join(songDir, start),
  ...rest,
  ...(wantsRender ? [] : ["--report-only"]),
];

console.log("song   : " + start);
console.log("audio  : " + (audio || "(none found)"));
console.log("args   : " + args.slice(3).map((a) => path.basename(a)).join(" "));
console.log("-".repeat(70));

const res = spawnSync(process.execPath, args, {
  stdio: "inherit",
  cwd: ROOT,
});
console.log("-".repeat(70));
console.log("render.mjs exit " + res.status);
process.exit(res.status || 0);
