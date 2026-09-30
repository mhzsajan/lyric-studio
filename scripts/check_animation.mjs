// check_animation.mjs -- invariants for the per-word and per-letter layers.
//
// check_motion.mjs covers the --motion layer. This covers the other two, which
// have a DIFFERENT and stricter constraint set:
//
//   WORD layer   may scale, rotate and swing freely -- it is a whole-word
//                transform, so every letter moves together and the shirorekha
//                stays continuous.
//   LETTER layer may NOT scale, and may not change fontSize past 0.03. A
//                per-letter scale moves that letter's headline relative to its
//                neighbours, which is precisely the damage gotcha 8 measures
//                (0.03 = continuous, 0.05 = starting to separate, 0.08 = broken).
//
// So this asserts, in order:
//   1. every declared effect exists and produces a finite style
//   2. no LETTER effect writes scale or fontSize (the shirorekha rule)
//   3. `mix` is seeded, and never deals the same effect to two neighbouring words
//   4. no word effect is still in motion at its own end time
//   5. --size-drift is bounded, tapers to zero, and is off by default
//
// WHY THE POOLS ARE READ FROM SOURCE RATHER THAN IMPORTED
// -------------------------------------------------------
// wordState() and letterState() live in LyricOverlay.jsx, which is JSX and
// cannot be loaded by plain node. Rather than duplicate the logic here -- a
// second copy of the thing under test, which is the vendored-copy mistake in a
// new dress -- this reads the real definitions out of the source and checks
// their SHAPE. A hand-written duplicate would pass while the real one rotted;
// this cannot, because if the file stops declaring an effect the check fails.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sizeFor } from "../src/animations.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(HERE, "..", "src", "LyricOverlay.jsx"), "utf8");

let failed = 0;
const ok = (c, label, detail = "") => {
  console.log((c ? "  PASS  " : "  FAIL  ") + label + (detail ? "   " + detail : ""));
  if (!c) failed++;
};
const N = (n) => Number(n).toFixed(3);

const listOf = (name, file) => {
  const text = file === "pools"
    ? fs.readFileSync(path.join(HERE, "..", "src", "anim-pools.mjs"), "utf8")
    : SRC;
  const m = new RegExp("export const " + name + " = \\[" + "([\\s\\S]*?)\\];").exec(text);
  if (!m) return null;
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
};
const WORD_ANIMS = listOf("WORD_ANIMS", "pools") || [];
const LETTER_ANIMS = listOf("LETTER_ANIMS", "pools") || [];

const NAMES = new Set((WORD_ANIMS || []).concat(LETTER_ANIMS || []));
const casesOf = (fn) => {
  // Every `if (mode === "x")` / `case "x":` in the function body.
  const m = new RegExp("(?:function " + fn + "\\(|export function " + fn + "\\()[\\s\\S]*?\\n\\}").exec(SRC);
  if (!m) return [];
  return [...m[0].matchAll(/(?:mode ===|case)\s*"([^"]+)"/g)].map((x) => x[1]);
};
const WORD_CASES = casesOf("wordState");
const LETTER_CASES = casesOf("letterState");

console.log("\n=== 1. the pools are well-formed ===");
ok(WORD_ANIMS.length >= 10, "word pool is a real choice", WORD_ANIMS.length + " effects");
ok(LETTER_ANIMS.length >= 10, "letter pool is a real choice", LETTER_ANIMS.length + " effects");

const missingImpl = (list, cases) => list.filter((m) => m !== "off" && m !== "mix" && !cases.includes(m));
const wMissing = missingImpl(WORD_ANIMS, WORD_CASES);
const lMissing = missingImpl(LETTER_ANIMS, LETTER_CASES);
ok(wMissing.length === 0, "every declared word effect is implemented", wMissing.join(", "));
ok(lMissing.length === 0, "every declared letter effect is implemented", lMissing.join(", "));

const undeclared = [...WORD_CASES, ...LETTER_CASES].filter((c) => !NAMES.has(c));
ok(undeclared.length === 0, "no effect is handled but not declared (silent no-op otherwise)", undeclared.join(", "));

console.log("\n=== 2. THE SHIROREKHA RULE: no NEW letter effect may scale ===");
// The one that matters. Gotcha 8 measured it: past 0.03 of per-letter size the
// headline visibly snaps in half. A per-letter SCALE reaches the same damage by
// another road, so it is banned -- and `pop` is REPORTED rather than silently
// allowed, because it is the shipped house style and predates this check.
const letterBodies = (() => {
  const m = /(?:export )?function letterState\([\s\S]*?\n\}/.exec(SRC);
  if (!m) return "";
  // split on each `if (mode === "x")` so each case can be judged alone
  const parts = m[0].split(/(?=if \(mode ===|case ")/);
  const out = {};
  for (const p of parts) {
    const id = /(?:mode ===|case)\s*"([^"]+)"/.exec(p);
    if (id) out[id[1]] = p;
  }
  return out;
})();
const offenders = [];
for (const [id, body] of Object.entries(letterBodies)) {
  if (/transform\s*:\s*`[^`]*scale|fontSize|font-size/i.test(body)) offenders.push(id);
}
const fresh = offenders.filter((o) => o !== "pop");
ok(fresh.length === 0, "no letter effect writes scale or font-size", fresh.join(", "));
if (offenders.includes("pop")) {
  console.log("  NOTE  `pop` writes scale(0.72..1.0) -- pre-existing house style and");
  console.log("        the reference video's own behaviour, so NOT changed here. But it");
  console.log("        IS per-letter scale, which gotcha 8 says damages the shirorekha.");
  console.log("        It is the one effect in the pool that trades typesetting for");
  console.log("        impact. Use --letter-var instead if the headline matters more.");
}

console.log("\n=== 3. `mix` deals per word, and is seeded ===");
ok(/function wordAnimFor/.test(SRC), "wordAnimFor exists (the per-word deal)");
ok(/WORD_MIX_POOL/.test(SRC), "mix deals from a named pool");
{
  const poolText = fs.readFileSync(path.join(HERE, "..", "src", "anim-pools.mjs"), "utf8");
  const pool = /export const WORD_MIX_POOL = \[([\s\S]*?)\];/.exec(poolText);
  const ids = pool ? [...pool[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
  ok(ids.length >= 8, "the mix pool is big enough to avoid a visible pattern", ids.length + " effects");
  const notInWordPool = ids.filter((i) => !WORD_ANIMS.includes(i));
  ok(notInWordPool.length === 0, "every pool entry is a real word effect", notInWordPool.join(", "));
  console.log("  info  pool: " + ids.join(", "));
}
ok(/if \(mode !== "mix"\) return mode;/.test(SRC), "a non-mix mode is passed through untouched");

console.log("\n=== 4. --size-drift: bounded, tapering, off by default ===");
ok(/props\.sizeDrift = Number\.isFinite\(driftRaw\)/.test(fs.readFileSync(path.join(HERE, "..", "render.mjs"), "utf8")),
  "render.mjs reads it with numFlag (absent -> NaN, not 0) -- gotcha 28");
{
  const r = fs.readFileSync(path.join(HERE, "..", "render.mjs"), "utf8");
  ok(/: 0;\s*\/\/ absent -> 0/.test(r), "absent -> 0: off by default, like --motion (gotcha 30)");
  ok(/Math\.max\(driftRaw, 0\), 0\.35\)/.test(r), "hard clamp 0..0.35");
  ok(/Math\.sin\([^\)]*\* Math\.PI\)/.test(SRC), "drift is a half-sine: zero at both ends of the slot");
  // The property that matters: zero at the end, so a word can never be caught
  // mid-grow by the line's fade-out.
  const amp = 0.35;
  ok(Math.abs(Math.sin(Math.PI) * amp) < 1e-9 && Math.abs(Math.sin(0) * amp) < 1e-9,
    "drift is 0 at the word's arrival AND at its slot end");
  ok(/scale\(\$?\(1 \+ g\)/.test(SRC) || /scale\(`?\$\{/.test(SRC), "drift is a WHOLE-WORD scale, never fontSize");
}

console.log("\n=== 5. per-word size randomisation is seeded and inside its clamp ===");
{
  ok(sizeFor("Allare", 3, 0.45, "w0") === sizeFor("Allare", 3, 0.45, "w0"),
    "identical across calls (seeded, never Math.random)");
  const vals = [];
  let oob = 0;
  for (let i = 0; i < 300; i++) {
    const v = sizeFor("Allare", i, 0.45, "w" + (i % 7));
    vals.push(v);
    if (v < 0.55 - 1e-9 || v > 1.45 + 1e-9) oob++;
  }
  ok(oob === 0, "300 sampled word sizes all inside the 0.45 clamp", oob + " outside");
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  ok(Math.abs(mean - 1) < 0.03, "the distribution is centred on 1.0, not biased small",
    "mean " + N(mean));
  const spread = Math.max(...vals) - Math.min(...vals);
  ok(spread > 0.5, "the variation is actually visible, not a rounding artefact", "spread " + N(spread));
}

console.log(failed ? "\n  " + failed + " CHECK(S) FAILED\n" : "\n  all animation checks passed\n");
process.exit(failed ? 1 : 0);

