// Regression test for gotcha 28: a numeric flag read with Number(flag(...))
// yields 0 when ABSENT, because Number(null) === 0 and Number.isFinite(0) is
// true. That silently replaced three documented defaults with zero -- most
// visibly --beat-tol, which made beats.json load, print, and then do nothing.
//
// Run: node scripts/check_flag_defaults.mjs
//
// This tests the RULE (absent -> NaN -> default) and the actual defaults this
// repo documents, by re-implementing the same read the CLI does. It cannot
// import render.mjs -- that file runs a render on import -- so the invariant is
// asserted against the flag helper's contract, and the prose defaults below
// are the ones AGENTS.md and README promise.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);

let failures = 0;
const ok = (name, cond, detail = "") => {
  console.log("  " + (cond ? "PASS" : "FAIL") + "  " + name + (detail ? "  (" + detail + ")" : ""));
  if (!cond) failures++;
};

// -- the trap itself ---------------------------------------------------------
ok("Number(null) is 0 (this is the bug)", Number(null) === 0);
ok("Number.isFinite(Number(null)) is true (so the guard passes)", Number.isFinite(Number(null)));

// -- numFlag's contract ------------------------------------------------------
const flag = (name, argv) => {
  const i = argv.indexOf(name);
  if (i >= 0) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(name + "="));
  return eq ? eq.slice(name.length + 1) : null;
};
const numFlag = (name, argv) => {
  const raw = flag(name, argv);
  if (raw === null || raw === undefined || raw === "") return NaN;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
};

ok("numFlag absent -> NaN", Number.isNaN(numFlag("--beat-tol", [])));
ok("numFlag --x=0 -> 0 (explicit zero still available)", numFlag("--beat-tol", ["--beat-tol=0"]) === 0);
ok("numFlag --x 0 -> 0", numFlag("--beat-tol", ["--beat-tol", "0"]) === 0);
ok("numFlag --x 0.8 -> 0.8", numFlag("--beat-tol", ["--beat-tol", "0.8"]) === 0.8);
ok("numFlag garbage -> NaN", Number.isNaN(numFlag("--beat-tol", ["--beat-tol", "abc"])));

// -- the documented defaults, applied through numFlag ------------------------
// Exactly as render.mjs resolves them.
const DEF = {
  beatTol: 0.4, sizeVar: 0.15, letterVar: 0, mixBlock: 8, length: 0,
};
function resolved(argv) {
  const n = (k) => numFlag(k, argv);
  const bv = n("--beat-tol");
  const sv = n("--size-var");
  const lv = n("--letter-var");
  const mb = n("--mix-block");
  const le = n("--length");
  return {
    beatTol: Number.isFinite(bv) && bv >= 0 ? bv : DEF.beatTol,
    sizeVar: Number.isFinite(sv) ? Math.min(Math.max(sv, 0), 0.45) : DEF.sizeVar,
    letterVar: Number.isFinite(lv) ? Math.min(Math.max(lv, 0), 0.03) : DEF.letterVar,
    mixBlock: Number.isFinite(mb) && mb > 0 ? mb : DEF.mixBlock,
    length: Number.isFinite(le) && le > 0 ? le : DEF.length,
  };
}

const none = resolved([]);
ok("no flags -> beatTol 0.4 (not 0)", none.beatTol === 0.4, String(none.beatTol));
ok("no flags -> sizeVar 0.15 (not 0)", none.sizeVar === 0.15, String(none.sizeVar));
ok("no flags -> letterVar 0", none.letterVar === 0);
ok("no flags -> mixBlock 8", none.mixBlock === 8);
ok("no flags -> length 0 (no explicit length)", none.length === 0);

const tol0 = resolved(["--beat-tol", "0"]);
ok("--beat-tol 0 -> 0 (beat sync explicitly OFF)", tol0.beatTol === 0, String(tol0.beatTol));
const sv0 = resolved(["--size-var", "0"]);
ok("--size-var 0 -> 0 (variation explicitly OFF)", sv0.sizeVar === 0, String(sv0.sizeVar));
const len = resolved(["--length", "417.10"]);
ok("--length 417.10 -> 417.10", len.length === 417.1, String(len.length));

// -- the contract is actually implemented in render.mjs ----------------------
// A future refactor could reintroduce Number(flag(...)) anywhere.
const src = fs.readFileSync(path.join(ROOT, "render.mjs"), "utf8");
// Strip comments first: the gotcha-28 explanation quotes the pattern on
// purpose, and a comment is not a read site.
const srcCode = src
  .split("\n")
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
  .join("\n");
const badReads = [...srcCode.matchAll(/Number\(\s*flag\((["'][^"']+["'])\s*\)/g)].map((m) => m[1]);
ok("no Number(flag(...)) reads left in render.mjs", badReads.length === 0,
   badReads.length ? badReads.join(", ") : "clean");
ok("numFlag is defined in render.mjs", /const numFlag = \(name\) =>/.test(src));
ok("numFlag is used for --beat-tol", /numFlag\("--beat-tol"\)/.test(src));
ok("numFlag is used for --size-var", /numFlag\("--size-var"\)/.test(src));
ok("numFlag is used for --letter-var", /numFlag\("--letter-var"\)/.test(src));
ok("numFlag is used for --length", /numFlag\("--length"\)/.test(src));
// Gotcha 27: the calibration sample module must be created before bundling.
ok("ensureCalibSamples is called in run()", /await ensureCalibSamples\(\)/.test(src));
ok("calib-samples.generated.js stays gitignored",
   fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8")
     .includes("src/calib-samples.generated.js"));

console.log(failures ? "\n  " + failures + " FAILURE(S)" : "\n  all flag-default assertions passed");
process.exit(failures ? 1 : 0);
