// wrap_report.mjs -- what the wrapper DOES to a real song, in rows.
//
//   node scripts/wrap_report.mjs "<song dir>"
//
// WHY THIS IS A SCRIPT AND NOT A ONE-LINER
// ----------------------------------------
// Two things have to be seen together and neither is visible alone: how many cues
// change row count, and what the worst-wrapped line actually looks like. A
// histogram says "most cues are one row" and a sample says "here is one line" --
// and a wrapper that quietly does nothing to 90 of 109 cues while looking good on
// the other 19 is a wrapper that has not been evaluated.
//
// The band is derived from the render's own numbers rather than typed in. The
// first version of check_wrap.mjs used 22em "roughly the band", every long line
// fitted on one row, and three sections tested nothing. A constant that is
// plausible instead of measured is the same bug in a test and in a report.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseLrc } from "../src/parse-lrc.mjs";
import { wrapRows } from "../src/wrap.js";
import { classifyText } from "../src/width-model.mjs";

// --size-preset medium is 105px, and the `horizontal` band is 64vw of 1920.
const SIZE = 105;
const FRAME_W = 1920;
const BAND_VW = { horizontal: 64, vertical: 50, center: 84, roam: 60 };
const WRAP_MARGIN = 1.08;

const [songDir] = process.argv.slice(2);
if (!songDir) {
  console.error('usage: node scripts/wrap_report.mjs "<song dir>"');
  process.exit(2);
}
const start = readdirSync(songDir).find((f) => /remotion_start\.lrc$/i.test(f));
if (!start) {
  console.error("no .remotion_start.lrc in " + songDir);
  process.exit(2);
}
const parsed = parseLrc(readFileSync(path.join(songDir, start), "utf8"), "");
const cues = parsed.cues || parsed;

// Reported per band, because --mode mix gives each cue one of three bands and
// the answer differs by a factor of two between them.
//
// The first version reported only the WIDEST band, on the reasoning that a line
// which cannot fit even there is definitely multi-row. That is true and it is the
// wrong number to look at: it made 4 of 109 cues wrap, which reads like the
// wrapper has done nothing, when 4 is the count for the one placement out of three
// that wraps least. The `vertical` band is 50vw against centre's 84vw, and the
// same line goes to three rows in one and two in the other.
// The key is `center`, matching geometry()'s place name. The first version of
// this table asked for `centre` -- the KIND, not the place -- and printed NaN for
// the widest band, which is precisely the band the report was built to show.
const bands = ["center", "horizontal", "vertical"];
const emOf = (vw) => (vw * (FRAME_W / 100)) / SIZE / WRAP_MARGIN;

console.log("");
console.log(start);
console.log("  " + cues.length + " cues | " + FRAME_W + "px wide, size " + SIZE +
  "px (--size-preset medium)");
console.log("");
console.log("  band        em    1 row   2 rows  3 rows  4+ rows");
for (const b of bands) {
  const em = emOf(BAND_VW[b]);
  const c = {};
  for (const cue of cues) {
    const n = wrapRows(cue.text, null, em).count;
    c[n] = (c[n] || 0) + 1;
  }
  const fourPlus = Object.entries(c)
    .filter(([k]) => Number(k) >= 4)
    .reduce((a, [, v]) => a + v, 0);
  console.log("  " + b.padEnd(11) +
    em.toFixed(1).padStart(5) +
    String(c[1] || 0).padStart(8) +
    String(c[2] || 0).padStart(9) +
    String(c[3] || 0).padStart(8) +
    String(fourPlus).padStart(9));
}
console.log("");

// The `vertical` band is the tightest and so shows the shape most clearly.
const bandEm = emOf(BAND_VW.vertical);
const rows = cues.map((c) => ({ text: c.text, ...wrapRows(c.text, null, bandEm) }));
const multi = rows.filter((r) => r.count > 1);

console.log("  in the `vertical` band (" + bandEm.toFixed(1) + "em): " +
  multi.length + " of " + rows.length + " cues wrap (" +
  ((multi.length / rows.length) * 100).toFixed(0) + "%)");
console.log("");
console.log("  the four widest, so the shape can be judged rather than counted:");
for (const r of [...multi].sort((a, b) => b.count - a.count).slice(0, 4)) {
  console.log("");
  console.log("    " + r.text);
  r.rows.forEach((row, i) => {
    console.log("      " + (i + 1) + " | " + row.join(" "));
  });
}
console.log("");