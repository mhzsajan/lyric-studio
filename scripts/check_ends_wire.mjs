// check_ends_wire.mjs -- the ends file has to reach the COMPOSITION, not just
// the report (gotcha 31).
//
// The bug this exists for: render.mjs read the .ends.txt, matched 109/109 cues
// and printed "timed (100%)", while writeGenerated() passed only LRC_TEXT to
// lyrics.generated.js and Root.jsx parsed that alone. Every cue in the video
// therefore used the estimated end (next line's start) -- lines lingering 0.28s
// to 2.6s past the singer's own tapped end -- with a report that said the
// opposite. Every existing check passed, because they all inspected render.mjs's
// parse and none of them inspected the composition's.
//
// So this asserts the CHANNEL, not the number:
//   1. render.mjs writes ENDS_TEXT into the generated module;
//   2. Root.jsx parses LRC_TEXT WITH it (a parse of LRC_TEXT alone is the bug);
//   3. the two parses agree, cue for cue, on end and endFrom;
//   4. with a companion present, no cue is left "estimated".
//
//   node scripts/check_ends_wire.mjs [lrc] [ends]
//
// Exits 1 on any failure. No ffmpeg, no render -- this is a source + parse
// assertion, so it runs in under a second and belongs before every render.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseLrc } from "../src/parse-lrc.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");

const LRC =
  process.argv[2] || "G:\\Lyrical Video\\Allare\\Allare Remotion.lrc";
const ENDS =
  process.argv[3] || "G:\\Lyrical Video\\Allare\\Allare Remotion.ends.txt";

let failed = 0;
const ok = (cond, label, detail = "") => {
  console.log((cond ? "  PASS  " : "  FAIL  ") + label + (detail ? "   " + detail : ""));
  if (!cond) failed++;
};

const renderMjs = readFileSync(path.join(ROOT, "render.mjs"), "utf8");
const rootJsx = readFileSync(path.join(ROOT, "src", "Root.jsx"), "utf8");
const generatedPath = path.join(ROOT, "src", "lyrics.generated.js");

console.log("\n=== 1. render.mjs writes the ends into the generated module ===");
ok(
  /export const ENDS_TEXT = /.test(renderMjs),
  "writeGenerated() emits ENDS_TEXT"
);
ok(
  /writeGenerated\([^)]*endsText\s*\)/.test(renderMjs),
  "every call site passes endsText",
  (renderMjs.match(/writeGenerated\(/g) || []).length + " writeGenerated refs"
);

console.log("\n=== 2. Root.jsx parses WITH the ends ===");
ok(
  /parseLrc\(\s*LRC_TEXT\s*,\s*ENDS_TEXT\s*\)/.test(rootJsx),
  "Root.jsx: parseLrc(LRC_TEXT, ENDS_TEXT)",
  /parseLrc\(\s*[^)]*\)/.exec(rootJsx)?.[0] || "no parseLrc call found"
);
ok(
  !/parseLrc\(\s*LRC_TEXT\s*\)/.test(rootJsx),
  "no bare parseLrc(LRC_TEXT) left in Root.jsx"
);
ok(
  /import\s*\{[^}]*ENDS_TEXT[^}]*\}\s*from\s*"[^"]*lyrics\.generated\.js"/.test(rootJsx),
  "Root.jsx imports ENDS_TEXT from lyrics.generated.js"
);

console.log("\n=== 3. the module on disk actually carries it ===");
if (existsSync(generatedPath)) {
  const g = readFileSync(generatedPath, "utf8");
  ok(/export const ENDS_TEXT = /.test(g), "lyrics.generated.js exports ENDS_TEXT");
} else {
  // Not a failure: a fresh clone has no generated module (gotcha 27). The
  // source assertions above are what gate the next render.
  console.log("  SKIP  src/lyrics.generated.js absent (fresh clone -- render.mjs writes it)");
}

console.log("\n=== 4. what the composition receives == what render.mjs reported ===");
if (existsSync(LRC) && existsSync(ENDS)) {
  const lrcText = readFileSync(LRC, "utf8");
  const endsText = readFileSync(ENDS, "utf8");

  // The composition does not read the song files -- it reads the generated
  // module. So compare the parse of the SOURCE (what render.mjs reports from)
  // against the parse of what is ACTUALLY IN THE MODULE. Comparing a parse to
  // the same parse proves nothing; this is the comparison that failed before.
  let moduleLrc = null;
  let moduleEnds = null;
  if (existsSync(generatedPath)) {
    const g = readFileSync(generatedPath, "utf8");
    // Extract up to the CLOSING backtick-semicolon, not the first `;` -- the
    // old form matched the semicolon inside the string and reported a spurious
    // one-byte difference that looked like corruption.
    const grab = (name) => {
      const m = new RegExp("export const " + name + " = `([\\s\\S]*?)`;\\n").exec(g);
      if (!m) return null;
      // Reverse esc() in the order esc() applied it: backslash, backtick, ${.
      return m[1]
        .replace(/\\\$\{/g, "${")
        .replace(/\\`/g, "`")
        .replace(/\\\\/g, "\\");
    };
    moduleLrc = grab("LRC_TEXT");
    moduleEnds = grab("ENDS_TEXT");
  }

  const reported = parseLrc(lrcText, endsText);

  if (moduleLrc === null) {
    console.log("  SKIP  no generated module to compare against (run a render first)");
  } else {
    ok(moduleLrc === lrcText, "LRC_TEXT in the module matches the source .lrc");
    ok((moduleEnds || "") === endsText, "ENDS_TEXT in the module matches the source .ends.txt",
      "module " + (moduleEnds ? moduleEnds.length : 0) + " chars vs file " + endsText.length + " chars");

    const rendered = parseLrc(moduleLrc, moduleEnds || "");
    ok(rendered.cues.length === reported.cues.length, "same cue count",
      rendered.cues.length + " vs " + reported.cues.length);

    let same = 0;
    const drift = [];
    for (let i = 0; i < Math.min(reported.cues.length, rendered.cues.length); i++) {
      const a = reported.cues[i];
      const b = rendered.cues[i];
      if (Math.abs(a.end - b.end) < 1e-9 && a.endFrom === b.endFrom) same++;
      else drift.push(`    cue ${i + 1}  ${a.time.toFixed(2)}s  reported end ${a.end.toFixed(2)} (${a.endFrom}) vs rendered ${b.end.toFixed(2)} (${b.endFrom})`);
    }
    ok(same === reported.cues.length, "every cue's end identical between report and render",
      same + "/" + reported.cues.length);
    drift.slice(0, 8).forEach((d) => console.log(d));
  }

  const estimated = reported.cues.filter((c) => c.endFrom === "estimated");
  ok(estimated.length === 0, "no cue left on an estimated end when a companion exists",
    estimated.length ? estimated.length + " estimated: " +
      estimated.slice(0, 5).map((c) => c.time.toFixed(2) + "s").join(", ") : "");

  const timed = reported.cues.filter((c) => c.endFrom.startsWith("timed"));
  console.log("  info  " + timed.length + "/" + reported.cues.length +
    " ends timed  (" + reported.cues.filter((c) => c.endFrom === "timed-clamped").length +
    " clamped to the next line's start)");
} else {
  console.log("  SKIP  song files not found:\n    " + LRC + "\n    " + ENDS +
    "\n    (pass paths: node scripts/check_ends_wire.mjs <lrc> <ends>)");
}

console.log(failed ? "\n  " + failed + " CHECK(S) FAILED\n" : "\n  all ends-wiring checks passed\n");
process.exit(failed ? 1 : 0);
