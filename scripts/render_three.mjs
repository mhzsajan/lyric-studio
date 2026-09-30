// render_three.mjs -- 3 songs x 3 fonts, one command, resumable.
//
//   node scripts/render_three.mjs            # render everything missing
//   node scripts/render_three.mjs --dry      # print the plan
//   node scripts/render_three.mjs --only Ritu
//
// WHY ONE SCRIPT
// --------------
// Nine renders is nine long commands, and a nine-long command list is how one
// gets typed slightly differently and produces a file that does not match the
// other eight. Every combination here is built from the same function, so the
// only thing that varies between them is the font.
//
// THE FONTS ARE UNICODE, AND THAT IS FORCED
// -----------------------------------------
// All three songs' .lrc files are Unicode Devanagari (verified: 291, 313 and
// 214 Devanagari codepoints respectively). A Preeti-era legacy font has no
// Devanagari cmap at all, so it cannot be used with a Unicode lyric file -- not
// "renders badly", CANNOT. The four working legacy fonts (arap007, cv-haha,
// mkali, pawang) are therefore ineligible here, which leaves the Unicode
// working set: yantramanav, arya, kalam, rajdhani.
//
// MOTION: EVERYTHING, AND ALL OF IT AT ONCE
// -----------------------------------------
// The brief was "all the variations and motions possible, letter by letter or
// word by word, horizontal vertical all". So this turns on every layer at its
// loudest and lets them compose. The house rule from ANIMATION.md still holds
// and is not negotiable: motion must FINISH inside each cue's own end, and must
// not push text off the frame. Both are asserted by check_motion.mjs and then
// by scan_visibility.py, which decodes every frame of the finished file -- so
// "loud" here cannot become "lingering".
//
//   --motion wild          21 choreographies, per line
//   --word-anim mix        a DIFFERENT effect dealt to every word, which is
//                          what stops a line looking like one gesture repeated
//   --letter-anim pop      per letter, nested inside each word
//   --letter-var 0.03      per-letter size, at the hard cap
//   --size-var 0.20        per-word size, well past the flat default
//   --size-drift 0.18      the word GROWS as it is sung and settles
//   --mode mix --mix-block 8   mixed placement, so lines move around the frame
//
// VERIFYING
// ---------
// Every render is followed by scan_visibility.py, which decodes EVERY frame and
// fails if any lyric is visible outside its own [start, end]. That is the gate
// that catches the one failure this configuration could plausibly cause: motion
// that is still travelling when the line ends.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const AUDIO = "G:\\Lyrical Video\\001 Audios";
const FONTS = path.join(ROOT, "..", "nepali-legacy-fonts", "fonts");

const SONGS = [
  { dir: "Jam Na Maya Jam", audio: "Jaam na Maya.mp3", lrc: "Jaam na Maya.remotion_start.lrc", len: 295.4 },
  { dir: "Kali Kali", audio: "Kali Kali.mp3", lrc: "Kali Kali.lrc", len: 409.1 },
  { dir: "Ritu", audio: "Ritu.mp3", lrc: "Ritu.lrc", len: 293.4 },
];

// Unicode only -- see the header. These are the three with the most distinct
// character, so the three videos look like three different pieces rather than
// three recolours.
const FONT_SET = [
  { slug: "yantramanav", file: path.join(FONTS, "yantramanav", "Yantramanav-Black.ttf"), note: "geometric black" },
  { slug: "arya", file: path.join(FONTS, "arya", "Arya-Bold.ttf"), note: "modern serif-bold" },
  { slug: "kalam", file: path.join(FONTS, "kalam", "Kalam-Bold.ttf"), note: "handwritten bold" },
];

const MOTION = [
  "--motion", "wild",
  "--word-anim", "mix",
  "--letter-anim", "pop",
  "--letter-var", "0.03",
  "--size-mode", "word",
  "--size-var", "0.20",
  "--size-drift", "0.18",
  "--mode", "mix",
  "--mix-block", "8",
  "--size", "150",
  "--shadow", "0 3px 16px rgba(0,0,0,0.85)",
];

const only = (() => {
  const i = process.argv.indexOf("--only");
  return i >= 0 ? process.argv[i + 1].split(",").map((s) => s.trim()) : null;
})();
const dry = process.argv.includes("--dry");
const skipExisting = !process.argv.includes("--force");

const jobs = [];
for (const s of SONGS) {
  if (only && !only.some((o) => s.dir.toLowerCase().includes(o.toLowerCase()))) continue;
  for (const f of FONT_SET) {
    jobs.push({ song: s, font: f });
  }
}

console.log("\n  " + jobs.length + " render(s)");
for (const j of jobs) console.log("    " + j.song.dir + "  +  " + j.font.slug);
console.log("");

if (dry) process.exit(0);

let made = 0, failed = [];
for (let i = 0; i < jobs.length; i++) {
  const { song, font } = jobs[i];
  const out = path.join("G:\\Lyrical Video", song.dir, `${song.dir} - ${font.slug}.mp4`);
  const label = `${song.dir} / ${font.slug}`;

  if (skipExisting && fs.existsSync(out) && fs.statSync(out).size > 100000) {
    console.log("  [" + String(i + 1).padStart(2) + "/" + jobs.length + "] skip  " + label);
    continue;
  }

  console.log("  [" + String(i + 1).padStart(2) + "/" + jobs.length + "] start " + label);
  const t0 = Date.now();

  const args = [
    path.join(ROOT, "render.mjs"),
    path.join(AUDIO, song.audio),
    path.join("G:\\Lyrical Video", song.dir, song.lrc),
    "--no-audio",
    "--length", String(song.len),
    "--font-file", font.file,
    "--out", out,
    ...MOTION,
  ];
  const r = spawnSync(process.execPath, args, { cwd: ROOT, stdio: "pipe", encoding: "utf-8" });
  const outText = (r.stdout || "") + (r.stderr || "");

  if (r.status !== 0 || !fs.existsSync(out)) {
    console.log("      RENDER FAILED (" + (r.status ?? "?") + ")");
    for (const line of outText.split("\n").filter((l) => /rror|ail/.test(l)).slice(0, 4)) {
      console.log("        " + line.trim().slice(0, 100));
    }
    failed.push(label);
    continue;
  }

  // The every-frame gate. This is the check that makes "all the motion
  // possible" safe: it fails the render if any lyric outlives its own end.
  const ends = path.join("G:\\Lyrical Video", song.dir,
    path.basename(song.lrc, ".lrc") + ".ends.txt");
  const scan = spawnSync("py", [
    path.join(ROOT, "scripts", "scan_visibility.py"), out,
    path.join("G:\\Lyrical Video", song.dir, song.lrc), ends, "--lit", "12",
  ], { cwd: ROOT, stdio: "pipe", encoding: "utf-8" });
  const scanText = (scan.stdout || "") + (scan.stderr || "");

  if (scan.status === 0) {
    const mb = (fs.statSync(out).size / 1048576).toFixed(1);
    const mins = ((Date.now() - t0) / 60000).toFixed(1);
    console.log("      ok  " + mb + " MB in " + mins + "m  --  every frame inside its cue");
    made++;
  } else {
    console.log("      SCAN FAILED -- a lyric is visible outside its own [start, end]");
    for (const line of scanText.split("\n").filter((l) => /overshoot|violation|OK:/.test(l)).slice(0, 3)) {
      console.log("        " + line.trim().slice(0, 100));
    }
    failed.push(label + " (scan)");
  }
}

console.log("\n  " + made + " done, " + failed.length + " failed");
if (failed.length) {
  console.log("  failed: " + failed.join(", "));
  process.exit(1);
}
console.log("  each file is in its own song folder, named <song> - <font>.mp4\n");
