// render_batch.mjs -- render a named list of song/font pairs, with a gate on each.
//
//   node scripts/render_batch.mjs --dry
//   node scripts/render_batch.mjs              # render whatever is missing
//   node scripts/render_batch.mjs --force      # re-render even if present
//
// WHY A SCRIPT AND NOT NINE COMMANDS
// ----------------------------------
// Every combination is built from the same function, so the only thing that
// varies is the font. A hand-typed list of nine long commands is how one of them
// ends up with a different --size-var and produces a file that does not match
// its eight siblings, with nothing to show the difference.
//
// THE GATE
// --------
// Each render is followed by scan_visibility.py, which decodes EVERY frame and
// fails if any lyric is visible outside its own [start, end]. That is the check
// that makes running every layer at full strength safe: `sequence` deliberately
// delays words until the previous one has begun, which is the effect, and also
// the one thing that could put a word on screen after its line ended. The
// compression is fitted to each cue's span and check_depth.mjs asserts it, but
// the only proof is the finished file.
//
// NO OUTPUT FILTERS
// -----------------
// An earlier version piped this through `Select-Object -First 5`, which closes
// the PowerShell pipeline and kills the node process mid-render. It looked
// like a render failure -- right duration reported, no output file, exit 1 --
// and cost a full re-run. Nothing here filters stdout.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const AUDIO = "G:\\Lyrical Video\\001 Audios";
const FONTS = path.join(ROOT, "..", "nepali-legacy-fonts", "fonts");
const VIDEO = "G:\\Lyrical Video";

const SONGS = {
  "Jam Na Maya Jam": { audio: "Jaam na Maya.mp3", lrc: "Jaam na Maya.remotion_start.lrc", len: 295.4 },
  "Kali Kali":       { audio: "Kali Kali.mp3", lrc: "Kali Kali.lrc", len: 409.1 },
  Ritu:             { audio: "Ritu.mp3", lrc: "Ritu.lrc", len: 293.4 },
  Allare:           { audio: null, lrc: "Allare Remotion.lrc", len: 417.1 },
};

const FONTSET = {
  yantramanav: { file: path.join(FONTS, "yantramanav", "Yantramanav-Black.ttf") },
  arya:        { file: path.join(FONTS, "arya", "Arya-Bold.ttf") },
  kalam:       { file: path.join(FONTS, "kalam", "Kalam-Bold.ttf") },
  rajdhani:    { file: path.join(FONTS, "rajdhani", "Rajdhani-Bold.ttf") },
};

// Everything on, at its loudest. --mode mix deals all eight presentations, so
// horizontal, vertical, centre and roam all appear, word-by-word and
// phrase-by-phrase.
//
// THE SIZE, AND WHY IT IS NOT THE ONLY THING THAT GOVERNS HOW BIG TEXT LOOKS
// ---------------------------------------------------------------------------
// --size is the BASE, and a base is not the peak. Three multipliers stack:
//
//     base 150
//       * --size-var 0.20    a word is up to 20% LARGER   -> 180px
//       * --size-drift 0.18  it grows further while sung  -> ~212px
//
// So the biggest word on screen is about 1.4x the base, and three of those fill a
// 1080p frame. Dropping the base 150 -> 145 is a 3% change: it helps, but if the
// complaint is "text covers the screen", --size-var and --size-drift are the
// bigger levers, and they are cheaper to reason about because they only affect
// the large words rather than shrinking every word.
//
// A named constant, so this is a one-line change rather than a hunt.
const BASE_SIZE = 145;

const MOTION = [
  "--depth", "wild",
  "--motion", "wild",
  "--word-anim", "mix",
  "--letter-anim", "pop",
  "--letter-var", "0.03",
  "--size-mode", "word",
  "--size-var", "0.20",
  "--size-drift", "0.18",
  "--mode", "mix",
  "--mix-block", "8",
  "--size", String(BASE_SIZE),
  "--shadow", "0 3px 16px rgba(0,0,0,0.85)",
];

// What is left to render. Ritu and Kali Kali already have their yantramanav
// depth video; Allare is blocked until its ends are re-tapped, so it is absent
// rather than listed and failing.
const JOBS = [
  ["Jam Na Maya Jam", "arya"],
  ["Jam Na Maya Jam", "kalam"],
  ["Jam Na Maya Jam", "rajdhani"],
  ["Kali Kali", "arya"],
  ["Kali Kali", "kalam"],
];

const dry = process.argv.includes("--dry");
const force = process.argv.includes("--force");

console.log("\n  " + JOBS.length + " render(s), every layer on");
for (const [s, f] of JOBS) console.log("    " + s + "  +  " + f);
console.log("");

if (dry) process.exit(0);

let made = 0;
const failed = [];

for (let i = 0; i < JOBS.length; i++) {
  const [dir, fslug] = JOBS[i];
  const song = SONGS[dir];
  const font = FONTSET[fslug];
  const out = path.join(VIDEO, dir, `${dir} - ${fslug} - depth wild.mp4`);
  const label = `${dir} / ${fslug}`;

  if (!song || !song.audio) { failed.push(label + " (no audio)"); continue; }
  if (!font || !fs.existsSync(font.file)) { failed.push(label + " (no font)"); continue; }

  if (!force && fs.existsSync(out) && fs.statSync(out).size > 100000) {
    console.log("  [" + String(i + 1).padStart(2) + "/" + JOBS.length + "] skip  " + label);
    continue;
  }

  console.log("  [" + String(i + 1).padStart(2) + "/" + JOBS.length + "] start " + label);
  const t0 = Date.now();

  const r = spawnSync(process.execPath, [
    path.join(ROOT, "render.mjs"),
    path.join(AUDIO, song.audio),
    path.join(VIDEO, dir, song.lrc),
    "--no-audio",
    "--length", String(song.len),
    "--font-file", font.file,
    "--out", out,
    ...MOTION,
  ], { cwd: ROOT, stdio: "pipe", encoding: "utf-8" });
  const log = (r.stdout || "") + (r.stderr || "");

  if (r.status !== 0 || !fs.existsSync(out)) {
    console.log("      RENDER FAILED (exit " + (r.status ?? "?") + ")");
    for (const line of log.split("\n").filter((l) => /rror|ends\s+:|refus/i.test(l)).slice(0, 5)) {
      console.log("        " + line.trim().slice(0, 104));
    }
    failed.push(label);
    continue;
  }

  const ends = path.join(VIDEO, dir, song.lrc.replace(/\.lrc$/i, "") + ".ends.txt");
  const endsArg = fs.existsSync(ends) ? [ends]
    : [path.join(VIDEO, dir, path.basename(song.lrc, ".lrc") + ".remotion_end.lrc")];

  const scan = spawnSync("py", [
    path.join(ROOT, "scripts", "scan_visibility.py"), out,
    path.join(VIDEO, dir, song.lrc), ...endsArg, "--lit", "12",
  ], { cwd: ROOT, stdio: "pipe", encoding: "utf-8" });
  const scanLog = (scan.stdout || "") + (scan.stderr || "");

  if (scan.status === 0) {
    const mb = (fs.statSync(out).size / 1048576).toFixed(1);
    const mins = ((Date.now() - t0) / 60000).toFixed(1);
    console.log("      ok  " + mb + " MB in " + mins + "m  --  every frame inside its cue");
    made++;
  } else {
    console.log("      SCAN FAILED -- a lyric is visible outside its own [start, end]");
    for (const line of scanLog.split("\n").filter((l) => /overshoot|interval|OK:/.test(l)).slice(0, 3)) {
      console.log("        " + line.trim().slice(0, 104));
    }
    failed.push(label + " (scan)");
  }
}

console.log("\n  " + made + " done, " + failed.length + " failed");
if (failed.length) console.log("  failed: " + failed.join(", "));
console.log("");
