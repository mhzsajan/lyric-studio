// What does the composition ACTUALLY think cue 1's end is, right now?
// Reads the module the render will use, not the source files.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseLrc } from "../src/parse-lrc.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const g = fs.readFileSync(path.join(HERE, "..", "src", "lyrics.generated.js"), "utf8");

const grab = (n) => {
  const m = new RegExp("export const " + n + " = `([\\s\\S]*?)`;").exec(g);
  if (m) return m[1].replace(/\\\$\{/g, "${").replace(/\\`/g, "`").replace(/\\\\/g, "\\");
  const m2 = new RegExp('export const ' + n + ' = "([^"]*)";').exec(g);
  return m2 ? m2[1] : null;
};

const lrc = grab("LRC_TEXT");
const ends = grab("ENDS_TEXT");
console.log("  ENDS_TEXT in the module: " +
  (ends === null ? "MISSING" : ends === "" ? "EMPTY  <-- the bug" : ends.length + " chars"));
console.log("  LRC_TEXT chars: " + (lrc ? lrc.length : "MISSING"));

const { cues } = parseLrc(lrc, ends);
for (let i = 0; i < 4; i++) {
  const c = cues[i];
  console.log("  cue %d  start %s  end %s  (%s)   text=%s",
    i + 1, c.time.toFixed(2), c.end.toFixed(2), c.endFrom, c.text);
}
console.log("\n  tapped ends (from the .ends.txt) for comparison: 98.61, 100.90, 102.55, 104.32");
