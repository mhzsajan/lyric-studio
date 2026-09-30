// only_line.mjs -- render ONE lyric line, so a look can be judged in seconds.
//
//   node scripts\only_line.mjs <song-dir> <cue-index> [more-flags...]
//   node scripts\only_line.mjs "G:\Lyrical Video\Kali Kali" 3 --cut word
//
// WHY THIS EXISTS
// ---------------
// Judging a change took six renders at three minutes each during the size work,
// and the answer to each was a single glance. That is a bad loop: every decision
// cost a song's worth of render time, so decisions got batched and the feedback
// arrived after the enthusiasm had gone.
//
// This makes one line cost a second or two. The line is rendered at FULL frame
// size with every flag the real render would use -- same depth layers, same
// motion, same colour, same font -- because a preview that is not the real thing
// is worse than none: it would show a look that the full render does not have.
//
// WHAT IT DELIBERATELY DOES NOT DO
// --------------------------------
// It does not shrink the resolution and call that a preview. A quarter-size
// render changes how a glow reads and how a 2-degree letter rotation reads, which
// are exactly the things being judged. It renders a SHORT CLIP at full
// resolution, containing the cue's own span plus a moment either side so the
// entrance and the exit are both visible.
//
// THE ENDS FILE IS STILL REQUIRED, and this is the point
// -----------------------------------------------------
// The cue's END comes from the .ends.txt, exactly as in a real render. A preview
// that guessed the end would happily show a line that the every-frame scan would
// then reject in the full render -- which is the most expensive possible way to
// find out. So this reads the same ends file and fails loudly without one.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseLrc } from "../src/parse-lrc.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const AUDIO_DIR = "G:\\Lyrical Video\\001 Audios";

// [name, lrc stem, audio, song length] -- the songs that exist. Kept here rather
// than discovered by scanning the drive because a scan finds the OLD renders and
// the mis-named ends files too, and this tool must not guess which is which.
const SONGS = {
  "Kali Kali":       { lrc: "Kali Kali.lrc",       audio: "Kali Kali.mp3",       len: 409.1 },
  Ritu:              { lrc: "Ritu.lrc",            audio: "Ritu.mp3",            len: 293.4 },
  "Jam Na Maya Jam": { lrc: "Jaam na Maya.remotion_start.lrc", audio: "Jaam na Maya.mp3", len: 295.4 },
};

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log("\n  usage: node scripts\\only_line.mjs <song-dir> <cue-index> [flags...]\n");
  console.log("  e.g.   node scripts\\only_line.mjs \"G:\\Lyrical Video\\Kali Kali\" 3 --cut word\n\n");
  process.exit(1);
}

const dir = args[0];
const cueIndex = Number(args[1]);
const extra = args.slice(2);

const key = Object.keys(SONGS).find((k) => dir.replace(/[\\/]+$/, "").endsWith(k));
if (!key) {
  console.error('  Unknown song directory: "' + dir + '". Known: ' +
    Object.keys(SONGS).join(", "));
  process.exit(1);
}
const song = SONGS[key];
const lrcPath = path.join(dir, song.lrc);
const audioPath = path.join(AUDIO_DIR, song.audio);

if (!fs.existsSync(lrcPath)) {
  console.error("  No .lrc at " + lrcPath);
  process.exit(1);
}

// The ends file, by the same candidates render.mjs prefers: the .ends.txt first,
// because a file that merely EXISTS is not a file that PARSES (the Kali Kali
// lesson -- a .remotion_end.lrc existed and contained nothing usable).
const endsCandidates = [
  lrcPath.replace(/\.lrc$/i, ".ends.txt"),
  path.join(dir, path.basename(song.lrc, ".lrc") + ".ends.txt"),
  path.join(dir, path.basename(song.lrc, ".lrc") + ".remotion_end.lrc"),
];
let endsPath = null;
for (const c of endsCandidates) {
  if (!fs.existsSync(c)) continue;
  const text = fs.readFileSync(c, "utf8");
  if (/\d{1,2}:\d{2}/.test(text)) { endsPath = c; break; }
}
if (!endsPath) {
  console.error(
    "  No usable ends file for " + key + ".\n" +
    "  Looked for:\n" + endsCandidates.map((c) => "    " + c).join("\n") + "\n" +
    "  A line preview needs the tapped END, because the cue's span is what the\n" +
    "  ends file supplies -- and guessing it here would show you a look that the\n" +
    "  every-frame scan then rejects in the full render."
  );
  process.exit(1);
}

const parsed = parseLrc(
  fs.readFileSync(lrcPath, "utf8"),
  fs.readFileSync(endsPath, "utf8")
);
const cues = parsed.cues || parsed;
const cue = cues[cueIndex];
if (!cue) {
  console.error("  No cue at index " + cueIndex + ". " + key + " has " +
    cues.length + " cues (0.." + (cues.length - 1) + ").");
  process.exit(1);
}

// A moment either side, so the entrance and the exit are both on the clip. The
// exit matters most: a layer that fails to finish by the cue's end is the bug
// this project cares about most, and it is only visible in the last second.
const PAD = 1.2;
const from = Math.max(0, cue.time - PAD);
const length = Math.max(0.8, (cue.end - cue.time) + PAD * 2);

// render.mjs has no --from, so the clip is made by rendering the whole file and
// cutting it. That sounds wasteful and is not: the duration is what dominates a
// Remotion render's cost, and --length controls it -- but --length is ABSOLUTE
// from zero, so a cue at 210s cannot be reached by shortening it.
//
// So this shifts the TIMESTAMPS instead: a temp .lrc whose cues start at zero and
// whose ends are relative, written next to the real one and deleted afterwards.
// The ends values are shifted by exactly the same amount, which is the part that
// would silently produce a wrong line if done to one and not the other -- the
// gotcha-31 shape, and the reason both numbers move in the same expression.
const shiftedLrc = path.join(dir, "_only_line.generated.lrc");
const shift = cue.time;
const toLrcTime = (s) => {
  const v = Math.max(0, s);
  const m = Math.floor(v / 60);
  return m + ":" + String(Math.floor(v % 60)).padStart(2, "0") +
    "." + String(Math.round((v % 1) * 100)).padStart(2, "0");
};
fs.writeFileSync(shiftedLrc,
  "[ti:" + (parsed.title || key) + "]\n" +
  "[ar:" + (parsed.band || "") + "]\n" +
  "[" + toLrcTime(cue.time - shift) + "]" + cue.text + "\n",
  "utf8");

// The ends file is `start | end | text`, NOT a bare timestamp. The first version
// wrote just the end time and render.mjs reported "no two pipes" and then
// refused the file outright -- which is the right behaviour from the renderer
// and a wasted render from here. The format lives in src/parse-ends.mjs and this
// now matches it, including the text, because the text is what render.mjs
// cross-checks the .lrc against.
const shiftedEnds = shiftedLrc.replace(/\.lrc$/, ".ends.txt");
fs.writeFileSync(shiftedEnds,
  toLrcTime(cue.time - shift) + " | " + toLrcTime(cue.end - shift) + " | " +
  cue.text + "\n",
  "utf8");

const out = path.join(dir, `_line-${String(cueIndex).padStart(2, "0")}.mp4`);
const fontFile = path.join(ROOT, "..", "nepali-legacy-fonts", "fonts",
  "yantramanav", "Yantramanav-Black.ttf");

// --presentation: WHICH layout this cue gets in the preview.
//
// THIS IS A CORRECTNESS FIX, NOT A CONVENIENCE.
//
// The preview writes a one-cue .lrc, so with --mode mix the plan deals cue 0 as
// `c-phrase` -- a PHRASE presentation -- and every per-word effect (--cut,
// --type, --color-mode per word) is then correctly doing nothing, because phrase
// units deliberately have no word spans. The first run of this tool showed plain
// coloured text with no cut and no typing, and the obvious reading was "the cut
// layer is broken". It was not; the preview was showing a phrase unit and the
// real render's cue 26 is an r-word unit.
//
// So the unit is pinned explicitly and PRINTED. A preview that quietly shows a
// different layout from the deliverable is worse than no preview, because it
// teaches you that a working feature does nothing.
function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}

// An explicit "0-0:<id>" range rather than "0:<id>". The bare form is legal, but
// "0" alone reads as an open-ended range in a plan whose whole grammar is
// ranges, and the first version of this used it and render.mjs rejected the spec
// with a message about chunk syntax -- which was correct of it.
const PRES = flag("--presentation") || "r-word";
const planFlag = "--mix-plan";
const planValue = "0-0:" + PRES;

console.log("\n  " + key + "  cue " + cueIndex +
  "   " + cue.time.toFixed(2) + "s .. " + cue.end.toFixed(2) +
  "s   (" + cue.text.length + " chars)");
console.log("  clip " + length.toFixed(1) + "s   ends from " + path.basename(endsPath));
console.log("  layout " + PRES + " (pinned; a bare one-cue .lrc would deal c-phrase)\n");

const t0 = Date.now();
let code = 0;
try {
  execFileSync(process.execPath, [
    path.join(ROOT, "render.mjs"),
    audioPath,
    shiftedLrc,
    "--no-audio",
    "--length", length.toFixed(2),
    "--font-file", fontFile,
    "--out", out,
    // Appended LAST so an explicit --mix-plan from the caller still wins.
    ...extra,
    "--mode", "mix",
    planFlag, planValue,
  ], { cwd: ROOT, stdio: "inherit", encoding: "utf8" });
} catch (e) {
  code = e.status === undefined ? 1 : e.status;
}

// The temp pair goes away whatever happened. A stale `_only_line.generated.lrc`
// sitting next to the real .lrc is a file that LOOKS like a song and would be
// picked up by a batch render later.
for (const f of [shiftedLrc, shiftedEnds]) {
  try { fs.unlinkSync(f); } catch { /* already gone */ }
}

const secs = ((Date.now() - t0) / 1000).toFixed(1);
if (code !== 0 || !fs.existsSync(out)) {
  console.error("\n  render failed (exit " + code + ")\n");
  process.exit(code || 1);
}
console.log("\n  " + out + "   " +
  (fs.statSync(out).size / 1048576).toFixed(1) + " MB in " + secs + "s" +
  (secs.length > 3 ? "  <- slower than expected; --preview would be quicker" : "") + "\n");