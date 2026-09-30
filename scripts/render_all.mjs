// render_all.mjs -- the seven songs, two videos each, every one gated.
//
//   node scripts\render_all.mjs --dry      # print the plan and exit
//   node scripts\render_all.mjs            # render whatever is missing
//   node scripts\render_all.mjs --force
//
// FOURTEEN RENDERS, AND WHY THE PLAN IS A TABLE AND NOT FOURTEEN COMMANDS
// ----------------------------------------------------------------------
// Fourteen hand-typed command lines is how one of them ends up with a different
// --size-var and produces a file that does not match its thirteen siblings, with
// nothing to show the difference. Here every job is built by one function from
// two data tables, so "identical apart from the font" is a property of the code
// rather than a promise about my typing.
//
// THE FONT CONSTRAINT, STATED PLAINLY
// -----------------------------------
// Four working UNICODE fonts exist: yantramanav, arya, kalam, rajdhani. Seven
// songs with non-repetitive fonts is therefore impossible -- there are not seven
// -- and the instruction was to use the known-good ones and accept a repeat.
//
// So each song gets a DIFFERENT PAIR, and the pairs rotate: no two consecutive
// songs lead with the same face, and a song's own two videos never match. Four
// unordered pairs exist (YA, AK, RY, KR), so three songs must share a pair with
// another. That is the arithmetic, and it is better to say it than to imply the
// seven fonts are distinct.
//
// WHY THE SLOW SONGS GET A DIFFERENT RECIPE
// -----------------------------------------
// Ritu (105 bpm) and Timilai Bhuleko (110) are the heartbroken ones. Two changes,
// both from the user's instruction that no dancing animation goes on them:
//
//   no --cut        torn clippings read playful
//   no --motion wild, no --word-anim mix
//                   `mix` deals from a pool containing drop, spin, tumble,
//                   wobble, swing, flip and zoom. Those are the dancing ones.
//                   Slow songs get --word-anim reveal (a rise into place) and
//                   --motion calm.
//
// And the colour goes the OTHER way from what you might expect: slow songs are
// the ones that get PER-LETTER colour, fast songs get per-word. That was your
// instruction, and it works -- a slow line holds long enough for the eye to read
// a gradient across a word, whereas on a fast line that detail is motion blur.
//
// NO OUTPUT FILTERS
// -----------------
// An earlier version piped this through `Select-Object -First 5`, which closes the
// PowerShell pipeline and kills the node process mid-render. It looked like a
// render failure -- right duration reported, no output file, exit 1 -- and cost a
// full re-run. Nothing here filters stdout.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SONGS_DIR = "H:\\Lyric Video Making Folder";
const OUT_DIR = "H:\\Lyric Video Making Folder\\RENDERED";
const FONTS = path.join(ROOT, "..", "nepali-legacy-fonts", "fonts");

// TEN confirmed fonts, in TWO CLASSES, and the class decides the flags.
//
//   UNICODE  native Devanagari codepoints. Rendered as-is with --font-file.
//            Structurally safe on all seven songs: no transcode, so no layout
//            that can be wrong, and no way for a word to come out misspelled.
//
//   PREETI   ZERO Devanagari codepoints -- by design. It renders by transcoding
//            the lyrics into the font's own ASCII key layout, which is lossy, so
//            it needs --legacy-font --layout Preeti AND the per-song safety
//            gate. A Preeti font on a song it cannot carry draws one word in two
//            typefaces with no error anywhere, and the gate refuses it.
//
// The class is not a stylistic preference here, it is a permission. `class` is
// read below and picks the flag set; a font is never given the wrong one, because
// --font-file on a Preeti file is a hard gate failure and --legacy-font on a
// Unicode file would transcode it into mojibake.
const FONTSET = {
  // UNICODE
  yantramanav: { class: "UNICODE", file: path.join(FONTS, "yantramanav", "Yantramanav-Black.ttf") },
  arya: { class: "UNICODE", file: path.join(FONTS, "arya", "Arya-Bold.ttf") },
  kalam: { class: "UNICODE", file: path.join(FONTS, "kalam", "Kalam-Bold.ttf") },
  rajdhani: { class: "UNICODE", file: path.join(FONTS, "rajdhani", "Rajdhani-Bold.ttf") },
  // PREETI
  arap007: { class: "PREETI", file: path.join(FONTS, "arap007", "ARAP007.TTF") },
  shreenath: { class: "PREETI", file: path.join(FONTS, "shreenath-bold", "Shreenath Bold.TTF") },
  pawang: { class: "PREETI", file: path.join(FONTS, "pawang", "PawanG.TTF") },
  mkali: { class: "PREETI", file: path.join(FONTS, "mkali", "MKali.TTF") },
  cvhaha: { class: "PREETI", file: path.join(FONTS, "cv-haha", "CV Haha.TTF") },
  himalaya: { class: "PREETI", file: path.join(FONTS, "himalayabold", "Himalayabold Regular.ttf") },
  katmandu: { class: "PREETI", file: path.join(FONTS, "katmandu", "Katmandu Regular.TTF") },
};

// Every common flag. `--size-preset medium` is the house size the user chose from
// the three-rung comparison: 105 / 0.08 / 0.05. Red and white only, duo at hue 0.
const COMMON = [
  "--size-preset", "medium",
  "--color-scheme", "duo",
  "--color-hue", "0",
  // HOW OFTEN a word takes the red. Measured over Kali Kali's 48 cues: at 1.0
  // exactly 50% of words are red, which is a COLOURED SENTENCE with white in it.
  // At 0.35 it is ~15% of words and about half the lines carry one accent -- so a
  // line is usually one word picked out, sometimes none, and never a block of
  // colour. Seeded per word, so the same words are accent words in both versions
  // of a song and on every re-render.
  "--color-accent", "0.35",
  "--scanlines", "40",
  "--scanline-alpha", "0.06",
  "--shadow", "0 3px 16px rgba(0,0,0,0.85)",
  // A long line breaks into rows at full size instead of being shrunk to fit one
  // row, and each line's horizontal placement varies per cue. Both are on by
  // default in render.mjs; they are named here so that "identical apart from the
  // font" is checkable against this file rather than against a memory of it.
  "--wrap", "rows",
  "--x-pos",
];

// FAST: every layer, dancing included. Colour PER WORD (calm paints words only).
const FAST = [
  "--loudest",
  "--color-mode", "calm",
  "--cut", "word",
  "--type", "letter",
];

// SLOW: no cut, no dancing. Colour PER LETTER.
const SLOW = [
  "--motion", "calm",
  "--depth", "calm",
  "--word-anim", "reveal",
  "--letter-anim", "pop",
  "--letter-var", "0.03",
  "--size-mode", "word",
  "--mode", "mix",
  "--mix-block", "8",
  "--color-mode", "vivid",
  "--type", "letter",
];

// [folder, song, audio, lrc, ends, seconds, treatment, fontV1, fontV2]
// `seconds` is PROBED by scripts/plan.mjs, never typed from memory.
//
// THE FONT PLAN, AND WHY THREE SONGS ARE UNICODE-ONLY
// All ten confirmed fonts are used and no song's own pair matches, but the pairs
// are NOT free: a PREETI font cannot carry a line the Preeti layout has no key
// for, and three songs contain pre-base i-matra words it cannot express.
//
//   Allare, Ritu, Wora Para   contain them  -> UNICODE only, 4 fonts to 6 videos
//   Jam Na Maya               2 of 7 safe   -> ARAP007, Shreenath
//   Kali Kali, Ow Amira,      all 7 safe    -> any Preeti font
//   Timilai
//
// That is why the three Unicode-only songs repeat. It is not the font count that
// forces it -- there are ten, not four -- it is the LYRICS. `preeti_safety.py` in
// the font repo measured it and the gate re-proves it at render time.
const JOBS = [
  ["01 Allare BPM 120", "Allare", "Allare.mp3",
    "अल्लारे.remotion_start.lrc", "अल्लारे.remotion_end.lrc", 417.1, FAST, "rajdhani", "kalam"],
  ["02 Jam Na Maya Jam BPM 115", "Jam Na Maya Jam", "Jaam na Maya.mp3",
    "Jaam na Maya.remotion_start.lrc", "Jaam na Maya.remotion_end.lrc", 295.4, FAST, "arap007", "shreenath"],
  ["03 Kali Kali BPM 120", "Kali Kali", "Kali Kali.mp3",
    "Kali Kali.remotion_start.lrc", "Kali Kali.remotion_end.lrc", 409.1, FAST, "pawang", "mkali"],
  ["04 Ow Amira BPM 122", "Ow Amira", "Ow Amira.mp3",
    "Ow Amira.remotion_start.lrc", "Ow Amira.remotion_end.lrc", 664.5, FAST, "cvhaha", "himalaya"],
  ["05 Ritu BPM 105", "Ritu", "Ritu.mp3",
    "ऋतु.remotion_start.lrc", "ऋतु.remotion_end.lrc", 293.4, SLOW, "arya", "yantramanav"],
  ["06 Timilai Bhuleko BPM 110", "Timilai Bhuleko", "Timilai Bhuleko.mp3",
    "तिमीलाई भुलेको.remotion_start.lrc", "तिमीलाई भुलेको.remotion_end.lrc", 323.3, SLOW, "katmandu", "pawang"],
  ["07 Wora Para BPM 115", "Wora Para", "Wora Para.mp3",
    "Wora Para.remotion_start.lrc", "Wora Para.remotion_end.lrc", 261.5, FAST, "rajdhani", "kalam"],
];

const dry = process.argv.includes("--dry");
const force = process.argv.includes("--force");

// Flatten to one entry per VIDEO, so the gate and the log speak in videos --
// which is what a caller thinks in -- while the plan stays in songs.
const work = [];
for (const [folder, song, audio, lrc, ends, secs, treatment, f1, f2] of JOBS) {
  work.push({ folder, song, audio, lrc, ends, secs, treatment, font: f1, v: 1 });
  work.push({ folder, song, audio, lrc, ends, secs, treatment, font: f2, v: 2 });
}

console.log("\n  " + work.length + " videos from " + JOBS.length + " songs");
console.log("  out: " + OUT_DIR + "\n");
for (const j of work) {
  const kind = j.treatment === SLOW ? "SLOW" : "fast";
  console.log("    " + j.song.padEnd(18) + " v" + j.v + "  " +
    j.font.padEnd(13) + kind + "   " + j.secs.toFixed(0) + "s");
}
console.log("");

if (dry) process.exit(0);

fs.mkdirSync(OUT_DIR, { recursive: true });

let made = 0;
const failed = [];

for (let i = 0; i < work.length; i++) {
  const j = work[i];
  const dir = path.join(SONGS_DIR, j.folder);
  const out = path.join(OUT_DIR, j.song + " - " + j.font + " - v" + j.v + ".mp4");
  const label = j.song + " v" + j.v + " / " + j.font;
  const n = String(i + 1).padStart(2) + "/" + work.length;

  const font = FONTSET[j.font];
  if (!font || !fs.existsSync(font.file)) {
    console.log("  [" + n + "] MISSING FONT  " + label);
    failed.push(label + " (font)");
    continue;
  }

  // The class picks the flags. Passing the wrong pair is not a style error, it is
  // a corruption: --font-file on a Preeti file fails the gate outright, and
  // --legacy-font on a Unicode file would transcode it into mojibake with no
  // error at all. So the two sets are built here and never mixed by hand.
  const fontFlags = font.class === "PREETI"
    ? ["--legacy-font", font.file, "--layout", "Preeti"]
    : ["--font-file", font.file];

  if (!force && fs.existsSync(out) && fs.statSync(out).size > 100000) {
    console.log("  [" + n + "] skip   " + label);
    continue;
  }

  console.log("  [" + n + "] start  " + label);
  const t0 = Date.now();

  const r = spawnSync(process.execPath, [
    path.join(ROOT, "render.mjs"),
    path.join(dir, j.audio),
    path.join(dir, j.lrc),
    "--no-audio",
    "--length", String(j.secs),
    ...fontFlags,
    "--out", out,
    ...COMMON,
    ...j.treatment,
  ], { cwd: ROOT, stdio: "pipe", encoding: "utf8" });

  const log = (r.stdout || "") + (r.stderr || "");
  if (r.status !== 0 || !fs.existsSync(out)) {
    console.log("      RENDER FAILED (exit " + (r.status ?? "?") + ")");
    for (const line of log.split("\n").filter((l) => /rror|ends\s+:|refus|Unknown/i.test(l)).slice(0, 4)) {
      console.log("        " + line.trim().slice(0, 104));
    }
    failed.push(label);
    continue;
  }

  // THE GATE. Stage 4 of the pipeline: decode EVERY frame and fail if any lyric
  // is visible outside its own [start, end]. This is what makes running every
  // layer at full strength safe -- `sequence` and the typed-on reveal both
  // deliberately DELAY words, which is the effect and also the one thing that
  // could put a word on screen after its line ended.
  const scan = spawnSync("py", [
    path.join(ROOT, "scripts", "scan_visibility.py"),
    out,
    path.join(dir, j.lrc),
    path.join(dir, j.ends),
    "--lit", "12",
  ], { cwd: ROOT, stdio: "pipe", encoding: "utf8" });

  const scanLog = (scan.stdout || "") + (scan.stderr || "");
  const mins = ((Date.now() - t0) / 60000).toFixed(1);

  if (scan.status === 0) {
    const mb = (fs.statSync(out).size / 1048576).toFixed(1);
    console.log("      ok  " + mb + " MB in " + mins + "m  -- every frame inside its cue");
    made++;
  } else {
    console.log("      SCAN FAILED -- a lyric is visible outside its own [start, end]");
    for (const line of scanLog.split("\n").filter((l) => /overshoot|interval|OK:/i.test(l)).slice(0, 3)) {
      console.log("        " + line.trim().slice(0, 104));
    }
    failed.push(label + " (scan)");
  }
}

console.log("\n  " + made + " passed, " + failed.length + " failed");
if (failed.length) console.log("  failed: " + failed.join(", "));
console.log("  out: " + OUT_DIR + "\n");