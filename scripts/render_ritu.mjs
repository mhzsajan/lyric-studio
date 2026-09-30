// render_ritu.mjs -- the one command.
//
//   node scripts\render_ritu.mjs --dry
//   node scripts\render_ritu.mjs --out "H:\...\Ritu - piece.mp4"
//   node scripts\render_ritu.mjs --beats        # quantise the camera to the grid
//
// WHY IT IS NOT render.mjs
// -----------------------
// render.mjs is the OVERLAY: text on a plate, for Add/Screen over a camera feed.
// Its flags are the overlay's --depth, --cut, --color-mode, the font gate, the
// ends contract. Almost none of that applies here: this piece has no feed under
// it, and its whole subject is a camera that falls forever.
//
// What it deliberately REUSES rather than reimplements:
//   - the .lrc parse, so a re-tap is picked up the same way
//   - the font preparation, so the Devanagari is the proven face and not a guess
//   - the FONT GATE, unchanged -- the piece renders Devanagari and a wrong
//     typeface is still a wrong word
//   - the width model is not used: there is no band to fit, the type is set large
//     and the camera is what moves
//
// THE ONE THING IT WILL NOT DO
// ----------------------------
// It refuses to run while another render holds `src/lyrics.generated.js`. Two
// renders in one tree means the last-prepared font wins, which produces two files
// that each look right and are not. This script checks for the batch marker and
// stops rather than producing a second one.

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseLrc } from "../src/parse-lrc.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SONG_DIR = "H:\\Lyric Video Making Folder\\05 Ritu BPM 105";

const FONTS = path.join(ROOT, "..", "nepali-legacy-fonts", "fonts");
const FONT_FILE = path.join(FONTS, "arya", "Arya-Bold.ttf");

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const withBeats = args.includes("--beats");
const outIdx = args.indexOf("--out");
const OUT = outIdx >= 0 ? args[outIdx + 1]
  : "H:\\Lyric Video Making Folder\\RENDERED\\Ritu - the piece.mp4";

// --- the lock ---------------------------------------------------------------
// The batch writes a marker while it holds the generated lyrics file. This is a
// lock FILE rather than a lock table because the thing being protected is a
// generated source file that another process rewrites, and a lock table would
// need its own cleanup story when a render is killed.
const LOCK = path.join(ROOT, "out", ".render-busy");
if (existsSync(LOCK)) {
  console.error("  refusing to run: another render is in progress.");
  console.error("  " + LOCK);
  console.error("  src/lyrics.generated.js is shared, and two renders in one tree");
  console.error("  means the last-prepared font wins. Wait for the batch to finish.");
  process.exit(1);
}

if (!existsSync(FONT_FILE)) {
  console.error("  no font at " + FONT_FILE);
  process.exit(1);
}

const start = readdirSync(SONG_DIR).find((f) => /remotion_start\.lrc$/i.test(f));
const end = readdirSync(SONG_DIR).find((f) => /remotion_end\.lrc$/i.test(f));
if (!start) {
  console.error("  no .remotion_start.lrc in " + SONG_DIR);
  process.exit(1);
}

const parsed = parseLrc(
  readFileSync(path.join(SONG_DIR, start), "utf8"),
  end ? readFileSync(path.join(SONG_DIR, end), "utf8") : ""
);
const cues = parsed.cues || parsed;
const lastEnd = cues.reduce((m, c) => Math.max(m, c.end), 0);

console.log("");
console.log("  " + start);
console.log("  " + cues.length + " cues, " + cues[0].time.toFixed(1) + "s .. " +
  lastEnd.toFixed(1) + "s");
console.log("  font: " + path.basename(FONT_FILE));
console.log("  beats: " + (withBeats ? "camera quantised to the grid" : "off"));
console.log("  out:  " + OUT);
console.log("");

if (dry) process.exit(0);

// Beat detection is OPTIONAL and its absence is not an error: it changes the
// camera's micro-rhythm and nothing else, so a song with no detectable grid still
// renders a complete, correct piece. Refusing to render for want of a grid would
// be refusing over the one input that does not change whether the film is right.
let beatTimes = [];
if (withBeats) {
  const audio = readdirSync(SONG_DIR).find((f) => /\.mp3$/i.test(f));
  const detect = path.join(HERE, "detect_beats.py");
  mkdirSync(path.join(ROOT, "out"), { recursive: true });
  const beatsPath = path.join(ROOT, "out", "ritu-beats.json");
  const r = spawnSync("py", [
    detect, path.join(SONG_DIR, audio), "--out", beatsPath,
  ], { cwd: ROOT, stdio: "pipe", encoding: "utf8" });
  if (r.status === 0 && existsSync(beatsPath)) {
    const j = JSON.parse(readFileSync(beatsPath, "utf8"));
    beatTimes = (j.beats || j.beatTimes || []).map(Number).filter(Number.isFinite);
    console.log("  beats: " + beatTimes.length + " detected");
  } else {
    console.warn("  beats: NOT detected -- rendering without the grid.");
    console.warn("  " + ((r.stderr || r.stdout || "").split("\n").slice(0, 3).join("\n  ")));
  }
}

// The props. Cues go in as data, not as parsed source, so the composition cannot
// re-derive an end time differently from the way the gate will check it -- gotcha
// 31 again, at the seam.
const props = {
  cues: cues.map((c, i) => ({
    index: c.index ?? i, time: c.time, end: c.end, text: c.text,
  })),
  beats: beatTimes,
  fontSize: 108,
  seed: "ritu",
  durationInFrames: Math.round(lastEnd * 30),
};

mkdirSync(path.join(ROOT, "out"), { recursive: true });
const propsPath = path.join(ROOT, "out", "ritu-props.json");
writeFileSync(propsPath, JSON.stringify(props, null, 1));
mkdirSync(path.dirname(OUT), { recursive: true });

// Prepare the font through the SAME path the overlay uses, so the face is the
// proven one and the font gate runs against it.
console.log("  preparing the font...");
const prep = spawnSync(process.execPath, [
  path.join(ROOT, "render.mjs"),
  path.join(SONG_DIR, readdirSync(SONG_DIR).find((f) => /\.mp3$/i.test(f))),
  path.join(SONG_DIR, start),
  "--no-audio",
  "--length", String(lastEnd),
  "--font-file", FONT_FILE,
  "--report-only",
], { cwd: ROOT, stdio: "pipe", encoding: "utf8" });

const prepLog = (prep.stdout || "") + (prep.stderr || "");
if (prep.status !== 0) {
  console.error("  the font gate refused:");
  console.error(prepLog.split("\n").slice(-14).map((l) => "    " + l).join("\n"));
  process.exit(1);
}
for (const line of prepLog.split("\n").filter((l) => /font gate|SAFE|missing/i.test(l))) {
  console.log("  " + line.trim());
}

// The render.
writeFileSync(LOCK, String(process.pid));
console.log("  rendering " + Math.round(lastEnd * 30) + " frames...");
const r = spawnSync(process.execPath, [
  path.join(ROOT, "node_modules", "@remotion", "cli", "remotion-cli.js"),
  "render", path.join(ROOT, "src", "index.js"), "RituPiece", OUT,
  "--codec=h264", "--crf=18", "--pixel-format=yuv420p",
  "--image-format=jpeg", "--muted",
  "--props=" + propsPath,
], { cwd: ROOT, stdio: "inherit" });

try { existsSync(LOCK) && (0); } catch {}
import("node:fs").then((fs) => { try { fs.unlinkSync(LOCK); } catch {} });

if (r.status !== 0) {
  console.error("  render failed, exit " + r.status);
  process.exit(1);
}
console.log("");
console.log("  OK  " + OUT);
console.log("");
console.log("  GATE IT BEFORE BELIEVING IT:");
console.log('    py scripts\\scan_visibility.py "' + OUT + '" "' +
  path.join(SONG_DIR, start) + '" "' + path.join(SONG_DIR, end || start) + '"');
console.log("  Every cue must clear at its tapped end, with no frame to spare.");
console.log("");