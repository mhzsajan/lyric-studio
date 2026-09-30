// probe_typing.mjs -- does the typed-on reveal actually FIT, once the word layer
// has also moved the words?
//
//   node scripts/probe_typing.mjs "<song folder>"
//
// WHY THIS SCRIPT EXISTS
// ----------------------
// The typing check (check_typing.mjs) asserts that the delay chain fits the cue's
// span, and it passes. It passes because it measures the chain FROM THE START OF
// THE LINE. That is the whole bug.
//
// The chain is indexed by a letter's position in the line, but `animatedWords`
// evaluates each letter against its OWN WORD'S start -- and that start is not the
// line's start. Two things push it later:
//
//   1. the words are spread across the cue span, so word 5 starts seconds after
//      word 1 began
//   2. --depth wild SEQUENCES the words, deliberately delaying each until the
//      previous one has begun
//
// So the last word's LAST LETTER is scheduled at
//
//     wStart(last word)  +  (totalLetters - 1) * step  +  dur
//
// which is the sum of two delays, and only the second one was ever checked. On a
// four-word line in a four-second cue that is already over budget, and the words
// at the end of the line are still typing when the line has finished -- which is
// exactly what was reported: "the first and last words start to appear, some
// words disappear".
//
// It is worth being precise about why the every-frame scan did NOT catch it. The
// scan measures INK against the cue window. A letter clipped to zero width draws
// no ink, so a word that never finishes typing is invisible rather than
// lingering -- there is nothing after the cue's end for the scan to find. The bug
// is a MISSING word, and this repo's gate is built to catch a word that stays too
// long. Those are opposite failures and only one of them is covered.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { typingPlan, fitDelay, levelIsLetterwise } from "../src/typing.js";
import { sequence, chainBudget } from "../src/depth.js";
import { wordTimings } from "../src/word-timing.js";
import { splitGraphemes } from "../src/letters.js";
import { parseLrc } from "../src/parse-lrc.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const dir = process.argv[2] ||
  "H:\\Lyric Video Making Folder\\03 Kali Kali BPM 120";
const lrcFile = fs.readdirSync(dir).find((f) => /remotion_start\.lrc$/i.test(f));
const endFile = fs.readdirSync(dir).find((f) => /remotion_end\.lrc$/i.test(f));
if (!lrcFile || !endFile) {
  console.error("  no .lrc pair under " + dir);
  process.exit(1);
}

const parsed = parseLrc(
  fs.readFileSync(path.join(dir, lrcFile), "utf8"),
  fs.readFileSync(path.join(dir, endFile), "utf8")
);
const cues = parsed.cues || parsed;

const LEVEL = process.argv[3] || "letter";
const DEPTH = process.argv[4] || "wild";

let over = 0;
let worst = 0;
let worstText = "";
let worstSpan = 0;
const rows = [];

for (const cue of cues) {
  const span = cue.end - cue.time;
  const words = wordTimings({ text: cue.text, time: cue.time, end: cue.end }, {});
  const n = words.length;
  if (!n) continue;

  let total = 0;
  for (const w of words) total += splitGraphemes(w.text).length;

  const plan = typingPlan(LEVEL, n, total);
  const fit = fitDelay(LEVEL, plan, span);

  const lastWord = n - 1;
  const seqRawLast = DEPTH === "off" ? 0 : sequence(DEPTH, lastWord, n, span, chainBudget(span));
  const seqLast = Math.min(
    seqRawLast,
    Math.max(0, span - (words[lastWord].start - cue.time))
  );
  const lag = words[lastWord].start + seqLast - cue.time;

  // The CORRECTED anchor, exactly as LyricOverlay computes it: a letter's
  // absolute time is max(wordStart, lineIndex * step), and its duration is
  // clamped to the cue time that word has left.
  //
  // EVERY word and letter is walked, not just the last one, because the last
  // word is not necessarily the tightest -- a mid-line word in a short cue can be
  // worse. The first version of this script measured only the last word, so it
  // could not have found a case where an EARLIER word overran.
  let finish = 0;
  let lettersBefore = 0;
  for (let i = 0; i < n; i++) {
    const g = splitGraphemes(words[i].text).length;
    // The clamp LyricOverlay applies, verbatim: the sequence may not add time the
    // word's own slot cannot spare. Without it this script models a pipeline that
    // no longer exists -- which is exactly how a probe ends up reporting a bug
    // that was fixed, and how you end up "fixing" it a second time.
    const seqRaw = DEPTH === "off" ? 0 : sequence(DEPTH, i, n, span, chainBudget(span));
    const seqI = Math.min(seqRaw, Math.max(0, span - (words[i].start - cue.time)));
    const lagI = words[i].start + seqI - cue.time;
    for (let k = 0; k < g; k++) {
      const idx = levelIsLetterwise(LEVEL) ? lettersBefore + k : i;
      const delay = Math.max(0, idx * fit.step - lagI);
      const dur = Math.min(fit.dur, Math.max(0.001, span - lagI));
      // Absolute finish time of this letter, measured from the start of the LINE.
      const at = lagI + delay + dur;

      // A floating-point epsilon. When the clamp bites, lagI is EXACTLY span --
      // the sequence was cut to precisely the slot's remaining time -- so the last
      // letter finishes at `span + dur` with dur at its 0.001 floor, and reports
      // as an overrun of one millisecond.
      //
      // That millisecond is not a defect: the word's slot ends at the cue's end
      // and it is drawn in the final frames that exist. The first version of this
      // probe reported it as 42 broken cues out of 74 and was believed, which is
      // the failure mode this comment exists to prevent -- a probe that cries wolf
      // is a probe that gets ignored, including when it is right.
      if (at > span + 0.002) {
        finish = Math.max(finish, at);
      }
    }
    lettersBefore += g;
  }

  rows.push({ text: cue.text, span, lag, chain: finish - lag, finish });
  if (finish > span) {
    over++;
    if (finish - span > worst) {
      worst = finish - span;
      worstText = cue.text.slice(0, 34);
      worstSpan = span;
    }
  }
}

console.log("");
console.log("  " + cues.length + " cues, --type " + LEVEL + " with --depth " + DEPTH);
console.log("");
console.log("  span   word lag   chain    finish   verdict   text");
console.log("  " + "-".repeat(78));
for (const r of rows.slice(0, 14)) {
  const bad = r.finish > r.span;
  console.log(
    "  " + r.span.toFixed(2).padStart(5) +
    "  " + r.lag.toFixed(2).padStart(8) +
    "  " + r.chain.toFixed(2).padStart(6) +
    "  " + r.finish.toFixed(2).padStart(7) +
    "  " + (bad ? "OVER  " : "ok    ") +
    "  " + r.text.slice(0, 22)
  );
}
console.log("");
console.log("  cues whose LAST LETTER finishes after the cue ends: " +
  over + " / " + cues.length);
if (worst) {
  console.log("  worst: +" + worst.toFixed(2) + "s past the end of a " +
    worstSpan.toFixed(2) + "s cue -- \"" + worstText + "\"");
  console.log("");
  console.log("  The chain alone fits. The word layer's own delay is what pushes it over,");
  console.log("  and check_typing.mjs does not model that -- it measures the chain from");
  console.log("  the start of the line, where the word layer has not delayed anything yet.");
}
console.log("");