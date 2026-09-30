// probe_words.mjs -- how long is each word actually ON SCREEN?
//
// WHY THIS IS A SEPARATE INSTRUMENT FROM scan_visibility.py
//
// The every-frame gate asks one question: does any lyric outlive its cue? It is
// a gate against words that stay too LONG, and it is blind to the opposite
// failure, which is a word that never arrives. A word drawn for a single frame
// leaves no ink after its cue and nothing to find past the end, so the gate
// passes a line that visibly dropped half of itself.
//
// That blindness is not hypothetical. The report this instrument was written for
// was "a random middle word appears in red, and the first and last words start
// to appear, some words disappear" -- and a fully green scan sat next to it.
//
// It walks the real pipeline: parse, wordTimings, chainBudget, clampedSequence.
// Every number it prints is one the composition will use, not a reimplementation
// of them, because a probe that models a pipeline that no longer exists is how a
// fixed bug gets "fixed" a second time.
//
//   node scripts\probe_words.mjs "<song dir>" [level]
//
// Exits 1 if any word gets less than one frame -- the case where the word is not
// merely hard to read but genuinely never drawn.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseLrc } from "../src/parse-lrc.mjs";
import { wordTimings, splitWords } from "../src/word-timing.js";
import { chainBudget, clampedSequence, MIN_WORD_FRAMES, DEPTH_LEVELS } from "../src/depth.js";
import { splitGraphemes } from "../src/letters.js";

const dir = process.argv[2];
const LEVEL = process.argv[3] && DEPTH_LEVELS.includes(process.argv[3]) ? process.argv[3] : "wild";
const FILL = Number(process.env.WORD_FILL_OVERRIDE);

// 10 frames at 30fps. Below this a word reads as a flicker, which on screen looks
// like a dropped word rather than like fast timing. Chosen from the shape of the
// complaint, not measured against a human, and it is a threshold not a target:
// the report is in frames so it can be argued with.
const READABLE = 10 / 30;

if (!dir) {
  console.error("usage: node scripts\\probe_words.mjs \"<song dir>\" [depth level]");
  process.exit(2);
}

const startFile = readdirSync(dir).find((f) => f.endsWith(".remotion_start.lrc"));
if (!startFile) {
  console.error("no .remotion_start.lrc in " + dir);
  process.exit(2);
}
const base = startFile.replace(".remotion_start.lrc", "");
const parsed = parseLrc(
  readFileSync(path.join(dir, startFile), "utf8"),
  readFileSync(path.join(dir, base + ".remotion_end.lrc"), "utf8")
);
const cues = parsed.cues || parsed;

console.log("");
console.log(base + " -- " + cues.length + " cues, --depth " + LEVEL +
  (Number.isFinite(FILL) ? ", --word-fill " + FILL : ""));
console.log("");
console.log("  span   words  letters  tightest word on screen   hold   verdict");
console.log("  " + "-".repeat(64));

let worstEver = Infinity;
let worstText = "";
let worstSpan = 0;
let starved = 0;
let thin = 0;
const shortCue = [];
const rows = [];

for (const cue of cues) {
  const span = cue.end - cue.time;
  if (!(span > 0)) continue;
  const words = wordTimings(
    { text: cue.text, time: cue.time, end: cue.end },
    Number.isFinite(FILL) ? { fill: FILL } : {}
  );
  if (!words.length) continue;

  const lastSlot = words[words.length - 1].start - cue.time;
  const budget = chainBudget(span, Number.isFinite(FILL) ? FILL : undefined, lastSlot);

  let tightest = Infinity;
  let letters = 0;
  words.forEach((w, i) => {
    const slot = w.start - cue.time;
    const d = clampedSequence(LEVEL, i, words.length, span, slot, budget);
    const visible = span - (slot + d);
    letters += splitGraphemes(w.text).length;
    if (visible < tightest) tightest = visible;
  });

  // The hold: silence after the last word, before the next line. This is the
  // "long gap before the upcoming word", measured from the side that shows how
  // much of it there is.
  const hold = span - words[words.length - 1].end + cue.time;
  // Two different things look like "the word was too brief" and only one of them
  // is this repo's fault.
  //
  //   GONE  the word is scheduled for less than a frame. Always our bug -- the
  //         pipeline asked for a word it had no time to draw.
  //   SHORT-CUE  the whole CUE is shorter than the readable floor, so the word had
  //         the entire cue and it is still brief. That is the tapped .lrc, which
  //         is ground truth, and no fill, chain or clamp can lengthen a cue. The
  //         only honest response is to name it, not to silently fail on it: a
  //         probe that reports other people's timing as our defect is a probe
  //         whose numbers stop being believed.
  const verdict = tightest < MIN_WORD_FRAMES ? "GONE"
    : span < READABLE ? "SHORT-CUE"
    : tightest < READABLE ? "thin" : "ok";
  if (verdict === "GONE") starved++;
  if (verdict === "thin") thin++;
  if (verdict === "SHORT-CUE") shortCue.push({ span, text: cue.text, visible: tightest });

  if (tightest < worstEver) {
    worstEver = tightest;
    worstText = cue.text;
    worstSpan = span;
  }

  rows.push({ span, n: words.length, letters, tightest, hold, verdict, text: cue.text });
}

rows.sort((a, b) => a.tightest - b.tightest);
for (const r of rows.slice(0, 12)) {
  console.log(
    "  " + r.span.toFixed(2).padStart(5) +
    "  " + String(r.n).padStart(5) +
    "  " + String(r.letters).padStart(7) +
    "  " + r.tightest.toFixed(3).padStart(22) + "s" +
    "  " + r.hold.toFixed(2).padStart(6) + "s" +
    "   " + r.verdict.padEnd(5) + " " + r.text.slice(0, 26)
  );
}

console.log("");
console.log("  tightest word on screen : " + worstEver.toFixed(3) + "s" +
  "  (" + Math.round(worstEver * 30) + " frames at 30fps)");
console.log("  in a " + worstSpan.toFixed(2) + "s cue -- \"" + worstText + "\"");
console.log("  words with no frame at all : " + starved + " / " + rows.length);
console.log("  words under 10 frames      : " + (starved + thin) + " / " + rows.length);
if (shortCue.length) {
  console.log("");
  console.log("  " + shortCue.length + " cue(s) are shorter than " + READABLE.toFixed(2) +
    "s, so a word there");
  console.log("  cannot be readable however it is scheduled. These are tapped .lrc");
  console.log("  timings, which are ground truth -- reported, not counted as faults:");
  for (const s of shortCue.slice(0, 5)) {
    console.log("    " + s.span.toFixed(2) + "s cue, word visible " +
      s.visible.toFixed(2) + "s  \"" + s.text + "\"");
  }
  if (shortCue.length > 5) console.log("    ... and " + (shortCue.length - 5) + " more");
}
console.log("");

if (starved > 0) {
  console.log("  A WORD WITH NO FRAME IS NOT DRAWN. That is the disappearing-word bug,");
  console.log("  and scan_visibility.py cannot see it -- it gates words that stay too");
  console.log("  LONG, and a word that never arrives leaves nothing behind to find.");
  console.log("");
  process.exit(1);
}
