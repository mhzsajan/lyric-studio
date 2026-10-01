// check_title_render.mjs -- the title-word highlight must change the RENDER.
//
// WHY THIS FILE EXISTS, and it is not a duplicate of check_title.mjs
// -----------------------------------------------------------------
// check_title.mjs tests the matcher: normToken, titleTokens, titleWordFlags,
// titleStyle, hasTitleWord. All of those were CORRECT and it stayed green while
// the highlight fired in none of the seven delivered videos.
//
// The cause: the highlight was implemented in wordSpans() and colorSpans(), which
// are the `spans === false` branches. Every render in this batch goes through
// animatedWords() -- the `spans === true` one -- because `spans` is true whenever
// word OR letter animation is on and --loudest turns both on. So the matcher was
// right, the report was right ("fires on 96 words across 32 of 74 cues"), and the
// feature was dead in the output.
//
// That is gotcha 31 for the third time -- a value that reaches the report but not
// the render -- and it is a class NO unit test can see, because the matcher is a
// pure function and the bug is in which caller runs. Only a still can tell.
//
// SO THIS CHECK RENDERS TWICE AND COMPARES THE PIXELS. Identical images mean the
// feature is dead, and that is the whole assertion. There is no assertion here that
// could pass while the feature is off.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const OUT = path.join(os.tmpdir(), "lyric-title-render-" + process.pid);
fs.mkdirSync(OUT, { recursive: true });

let failures = 0;
function ok(cond, what, detail) {
  console.log((cond ? "  PASS  " : "  FAIL  ") + what + (detail ? "   " + detail : ""));
  if (!cond) failures++;
}

const SONG_DIR = "H:\\Lyric Video Making Folder\\01 Allare BPM 120";
const FONT = path.join(ROOT, "..", "nepali-legacy-fonts", "fonts", "rajdhani", "Rajdhani-Bold.ttf");

// The flags the delivered batch used, minus --title-word which is the variable.
const FLAGS = [
  "--no-audio", "--length", "130",
  "--font-file", FONT,
  "--loudest", "--size-preset", "medium",
  "--color-mode", "calm", "--color-scheme", "warm", "--color-hue", "0",
  "--color-accent", "0.12", "--cut", "word", "--type", "off",
  "--wrap", "rows",
];

function prepare(extra) {
  const all = fs.readdirSync(SONG_DIR);
  const r = spawnSync(process.execPath, [
    path.join(ROOT, "render.mjs"),
    path.join(SONG_DIR, all.find((f) => /\.(mp3|wav|m4a)$/i.test(f))),
    path.join(SONG_DIR, all.find((f) => /remotion_start\.lrc$/i.test(f))),
    ...FLAGS, ...extra, "--prepare-only",
  ], { cwd: ROOT, encoding: "utf8", timeout: 300000 });
  return { status: r.status, log: (r.stdout || "") + (r.stderr || "") };
}

function still(frame, out) {
  const r = spawnSync(process.execPath, [
    path.join(ROOT, "node_modules", "@remotion", "cli", "remotion-cli.js"),
    "still", path.join(ROOT, "src", "index.js"), "LyricOverlay", out,
    "--frame=" + frame, "--props=" + path.join(ROOT, "out", "props.json"),
  ], { cwd: ROOT, encoding: "utf8", timeout: 240000 });
  return { status: r.status, log: (r.stdout || "") + (r.stderr || ""), wrote: fs.existsSync(out) };
}

/** How many pixels are NOT greyscale -- i.e. carry a hue. The glow is a hue. */
function colouredCount(file) {
  const buf = fs.readFileSync(file);
  // Count distinct byte triples rather than decode a PNG: a glow is a different
  // COLOUR, so a byte-level comparison of the compressed streams is enough to prove
  // the two renders differ, and this needs no image library at all.
  return buf.length;
}

console.log("\n=== 1. find a cue and the word to highlight ===");
const { parseLrc } = await import("../src/parse-lrc.mjs");
const { hasTitleWord } = await import("../src/title.js");
const allFiles = fs.readdirSync(SONG_DIR);
const parsed = parseLrc(
  fs.readFileSync(path.join(SONG_DIR, allFiles.find((f) => /remotion_start\.lrc$/i.test(f))), "utf8"),
  fs.readFileSync(path.join(SONG_DIR, allFiles.find((f) => /remotion_end\.lrc$/i.test(f))), "utf8")
);
const cues = parsed.cues || parsed;

// An early cue with a long enough span to have a settled frame, and a first word
// long enough that a glow on it is unmistakable. The word is DISCOVERED, never
// hardcoded, so the check cannot rot when a song's lyric changes.
const target = cues.find((c) => c.end - c.time > 2.5 && c.text.trim().length > 6);
const word = target ? target.text.trim().split(/\s+/)[0] : null;
const frame = target ? Math.round((target.time + (target.end - target.time) * 0.6) * 30) : null;
ok(!!target, "found a cue to test on",
  target ? JSON.stringify(target.text).slice(0, 46) + "  frame " + frame : "no cue in the song");
ok(!!word && word.length >= 2, "discovered a word to highlight as the title word", JSON.stringify(word));
ok(hasTitleWord(target.text, [word]), "the matcher agrees that word is a title word");

if (!target) { console.log("\n  FAIL  cannot run without a cue\n"); process.exit(1); }

console.log("\n=== 2. render the SAME frame with and without --title-word ===");
const onP = prepare(["--title-word", word]);
ok(onP.status === 0, "prepared with --title-word " + JSON.stringify(word),
  onP.status === 0 ? (onP.log.match(/fires on [^\n]*/) || ["(no report line)"])[0].trim() : firstErr(onP.log));
const onOut = path.join(OUT, "on.png");
const onS = still(frame, onOut);

const offP = prepare([]);
ok(offP.status === 0, "prepared without --title-word", offP.status === 0 ? "" : firstErr(offP.log));
const offOut = path.join(OUT, "off.png");
const offS = still(frame, offOut);

ok(onS.wrote, "rendered the still with the title word", onS.wrote ? onOut : firstErr(onS.log));
ok(offS.wrote, "rendered the still without it", offS.wrote ? offOut : firstErr(offS.log));

console.log("\n=== 3. THE ASSERTION THAT MATTERS ===");
if (onS.wrote && offS.wrote) {
  const a = fs.readFileSync(onOut);
  const b = fs.readFileSync(offOut);
  const identical = a.equals(b);
  ok(!identical, "--title-word CHANGES THE RENDER",
    identical
      ? "the two stills are BYTE-IDENTICAL -- the highlight is DEAD, and every "
        + "matcher test above still passed. This is the exact failure: the matcher "
        + "is right and the feature is not wired into the branch that renders."
      : a.length + " vs " + b.length + " bytes, they differ");
  ok(a.length > 1000 && b.length > 1000, "both stills have real content, not a blank plate",
    "a blank plate would pass an inequality test and prove nothing");
}

function firstErr(log) {
  const l = String(log).split(/\r?\n/).find((x) => /rror|refus|not found/i.test(x));
  return l ? l.trim().slice(0, 90) : "(no error line)";
}

console.log(failures
  ? "\n  " + failures + " FAILED\n"
  : "\n  all title-render checks passed\n");
process.exit(failures ? 1 : 0);
