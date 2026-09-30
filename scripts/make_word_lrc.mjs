// make_word_lrc.mjs -- a throwaway .lrc containing every distinct word of a
// song, one per line, one second apart.
//
// Why this exists: reviewing a font means reading WORDS, and reading words
// needs a side-by-side. "Show me the transformation" is answerable three ways
// and only one of them is trustworthy:
//
//   1. a text table of word -> keys        (proves the CODES agree, not the
//                                          GLYPHS -- gotcha 23's whole point)
//   2. PIL drawing the Devanagari          (PIL has no Raqm here, so conjuncts
//                                          do not fuse and the sheet is a lie)
//   3. rendering both fonts through the SAME engine and comparing the pictures
//
// So this builds the input for (3): the same word list, rendered once with the
// font under test and once with a known-good Unicode font, then stitched by
// scripts/word_sheet.py. Both columns go through Chromium, so both are shaped
// correctly and the comparison is honest.
//
//   node scripts/make_word_lrc.mjs "<song>.lrc" out/wordcheck.lrc [--slot 1.0]
import fs from "node:fs";
import path from "node:path";

const STAMP = /\[(\d{1,3}):([0-5]?\d(?:[.:]\d{1,3})?)\]/g;
const META = /^\[(ti|ar|al|au|by|re|ve|length|offset|ti-font|ti-fontfile):/i;

const src = process.argv[2];
const dst = process.argv[3] || "out/wordcheck.lrc";
const slotArg = process.argv.indexOf("--slot");
const slot = slotArg > 0 ? Number(process.argv[slotArg + 1]) : 1.0;
if (!src) {
  console.error("usage: node scripts/make_word_lrc.mjs <song.lrc> [out.lrc] [--slot 1.0]");
  process.exit(1);
}

const seen = [];
const have = new Set();
for (const raw of fs.readFileSync(src, "utf8").split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || META.test(line)) continue;
  const text = line.replace(STAMP, "").trim();
  if (!text) continue;
  for (const w of text.split(/\s+/)) {
    const core = w.replace(/^[.,!?;:।॥…-]+|[.,!?;:।॥…-]+$/g, "");
    if (core && !have.has(core)) {
      have.add(core);
      seen.push(core);
    }
  }
}

const stamp = (s) => {
  const m = Math.floor(s / 60);
  return "[" + String(m).padStart(2, "0") + ":" + (s - m * 60).toFixed(2).padStart(5, "0") + "]";
};

const rows = seen.map((w, i) => stamp(i * slot) + w);
const body = [
  "[ti:Word check]",
  ...rows,
  "",
].join("\n");

fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.writeFileSync(dst, body, "utf8");

const seconds = (seen.length * slot).toFixed(2);
console.log("  wrote " + dst);
console.log("  " + seen.length + " words, one every " + slot + "s -> render --length " + seconds);
console.log("  keys:");
console.log("  " + seen.map((w, i) => String(i).padStart(3) + " " + w).join("   "));
