// plan.mjs -- read the song folder and print the render plan. No rendering.
//
//   node scripts\plan.mjs
//
// WHY A FILE AND NOT AN INLINE node -e
// ------------------------------------
// Three of the seven songs have NEPALI filenames -- Allare, Ritu and Timilai
// Bhuleko all do -- and every one of those has to survive being passed to a
// child process, a lrc parser and a renderer. Round-tripping them through a
// PowerShell-quoted `node -e` is how they get mangled: `$` inside a double-quoted
// PowerShell string is interpolation, a backslash before it changes the regex,
// and a non-ASCII name that survives the shell may still not survive the
// encoding of the temp file. The repo has a rule about exactly this -- never
// round-trip a non-ASCII path through PowerShell -- and a plan script is where
// that rule is easiest to obey.
//
// WHAT IT PRINTS
// --------------
// For each song: the real filename (escaped, so it is legible), the cue count,
// the end coverage, the audio duration PROBED RATHER THAN ASSUMED, and which
// .lrc the ends file will be paired with. The pairing is the part that has gone
// wrong before: render.mjs prefers an ends file that PARSES, and a preview must
// resolve the same file the real render will.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseLrc } from "../src/parse-lrc.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = "H:\\Lyric Video Making Folder";
const FFMPEG = "C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe";

/** Duration in seconds, probed from the file. Assumed lengths are how a render
 *  ends 20 seconds short of the song and nobody notices until the show. */
function duration(audioPath) {
  try {
    const out = execFileSync(FFMPEG, ["-i", audioPath], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return null;   // ffmpeg writes its banner to stderr
  } catch (e) {
    const log = (e.stderr || "") + "";
    const m = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(log);
    if (!m) return null;
    return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  }
}

const dirs = fs.readdirSync(ROOT)
  .filter((d) => /^\d\d\s/.test(d))
  .sort();

console.log("\n  " + dirs.length + " numbered song folders in " + ROOT + "\n");
console.log("  " + "folder".padEnd(28) + "cues   ends   audio    last lyric");
console.log("  " + "-".repeat(72));

const rows = [];
for (const d of dirs) {
  const dir = path.join(ROOT, d);
  const files = fs.readdirSync(dir);
  const lrc = files.find((f) => /remotion_start\.lrc$/i.test(f));
  const end = files.find((f) => /remotion_end\.lrc$/i.test(f));
  const mp3 = files.find((f) => /\.mp3$/i.test(f));
  if (!lrc || !end || !mp3) {
    console.log("  " + d.slice(0, 26).padEnd(28) + "INCOMPLETE  " +
      ["lrc", "end", "mp3"].filter((_, i) => ![lrc, end, mp3][i]).join(" "));
    continue;
  }
  const parsed = parseLrc(
    fs.readFileSync(path.join(dir, lrc), "utf8"),
    fs.readFileSync(path.join(dir, end), "utf8")
  );
  const cues = parsed.cues || parsed;
  const timed = cues.filter((c) => Number.isFinite(c.end) && c.end > c.time).length;
  const dur = duration(path.join(dir, mp3));
  const lastEnd = cues.length ? cues[cues.length - 1].end : 0;

  console.log("  " + d.slice(0, 26).padEnd(28) +
    String(cues.length).padStart(4) + "  " +
    (timed + "/" + cues.length).padStart(6) + "  " +
    (dur ? dur.toFixed(1) + "s" : "?").padStart(7) + "  " +
    lastEnd.toFixed(1) + "s");

  // Anything that would make the render wrong rather than merely different.
  const warn = [];
  if (dur && lastEnd > dur + 0.5) {
    warn.push("LAST LYRIC IS AFTER THE AUDIO ENDS by " + (lastEnd - dur).toFixed(1) + "s");
  }
  if (timed !== cues.length) warn.push(timed + " cues have no end");
  if (dur && lastEnd < dur - 12) {
    warn.push("audio runs " + (dur - lastEnd).toFixed(1) + "s past the last lyric");
  }
  for (const w of warn) console.log("      ! " + w);

  rows.push({ dir, d, lrc, end, mp3, cues: cues.length, dur, lastEnd });
}

console.log("\n  real filenames, escaped (these are what the batch must pass):\n");
for (const r of rows) {
  console.log("    " + r.d);
  console.log("        lrc  " + JSON.stringify(r.lrc));
  console.log("        end  " + JSON.stringify(r.end));
  console.log("        mp3  " + JSON.stringify(r.mp3));
}
console.log();