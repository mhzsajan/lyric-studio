// check_bundle.mjs -- does the source tree COMPILE?
//
//   node scripts\check_bundle.mjs
//
// WHY THIS EXISTS, AND IT IS NOT A DEFENSIVE CHECK
// -------------------------------------------------
// A missing space -- `function jali` -- in src/ritu/motifs.jsx killed nine
// renders in a row. Every one of them failed with the same esbuild transform
// error, because every render bundles src/index.js and RituPiece.jsx imports the
// motif module, so a typo in one leaf file takes out the whole pipeline.
//
// The 19 other suites all passed while it was broken. They import the pure
// modules directly, and a file that cannot PARSE is not a function anybody can
// call, so nothing in the repo could see it. The renders were the only instrument
// that noticed, and they each cost five minutes to notice it with.
//
// That is gotcha 15 with the tables turned: the check that would have caught it
// did not exist, and the thing that did catch it was the most expensive possible
// instrument. This is the cheap one.
//
// WHAT IT DOES
// ------------
// Bundles src/index.js with the same loaders Remotion uses and the same externals.
// It does not evaluate anything and it does not need a font, a render, or audio --
// so it runs in about a second and belongs in the fast suite.
//
// It deliberately does NOT parse each file in isolation. A file can parse alone
// and fail in the graph, which is exactly the second bug here: RituPiece.jsx
// imported `FONT_FAMILY` from a module that exports `FONT_FAMILY_NAME`. Every
// file parsed. Only the bundle knew.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

let failed = 0;
const ok = (c, label, detail = "") => {
  console.log((c ? "  PASS  " : "  FAIL  ") + label + (detail ? "   " + detail : ""));
  if (!c) failed++;
};

/**
 * The esbuild binary, bypassing the `.cmd` shim.
 *
 * Two attempts used `node_modules/.bin/esbuild.cmd` with `shell: true` and both
 * were wrong, in ways worth recording because the symptom in each case was a
 * message about something else entirely:
 *
 *   without `shell`, spawning a .cmd returns a null status and no output, which
 *   reads as "the tree does not compile" for a tree that compiles fine;
 *   with `shell`, the path under "Default Project" is split at the space and the
 *   error is `is not recognized as an internal or external command`.
 *
 * The platform package ships the real executable, so calling it directly needs
 * neither a shell nor any quoting, and a path with a space is then a non-event.
 */
function findEsbuild() {
  const pkg = path.join(ROOT, "node_modules", "@esbuild", "win32-x64");
  if (process.platform === "win32" && existsSync(path.join(pkg, "esbuild.exe"))) {
    return path.join(pkg, "esbuild.exe");
  }
  const local = path.join(ROOT, "node_modules", ".bin",
    process.platform === "win32" ? "esbuild.cmd" : "esbuild");
  return existsSync(local) ? local : null;
}

console.log("\n=== 1. the source tree bundles ===");
{
  const esbuild = findEsbuild();
  if (!esbuild) {
    ok(false, "esbuild is available", "not found -- this check cannot run");
  } else {
    const out = mkdtempSync(path.join(tmpdir(), "lyric-bundle-"));
    const r = spawnSync(esbuild, [
      path.join(ROOT, "src", "index.js"),
      "--bundle",
      "--outfile=" + path.join(out, "bundle.js"),
      "--loader:.jsx=jsx",
      "--loader:.js=jsx",
      "--external:remotion",
      "--external:react",
      "--log-level=warning",
    ], { encoding: "utf8" });
    const log = ((r.stdout || "") + (r.stderr || "")).trim();
    rmSync(out, { recursive: true, force: true });

    // On Windows `esbuild.cmd` is a batch file, and spawning one without a shell
    // yields a null status and no output -- which reads exactly like "the tree does
    // not compile" for a tree that compiles perfectly. Reported in full the first
    // time, because a check that fails for its own reasons is worse than no check.
    if (r.status === null && !log) {
      ok(false, "esbuild could be invoked",
        "status null with no output -- on Windows the .cmd wrapper needs shell:true");
    } else {
      ok(r.status === 0, "src/index.js compiles as a graph",
        r.status === 0 ? "" : (log || "exit " + r.status).slice(0, 400));
    }

    // The specific failure this was written for, checked by name. A generic
    // compile assertion catches it too, but naming it means the failure message
    // says what to look at, which is the difference between a red suite you
    // understand and a red suite you go and investigate.
    ok(!/Transform failed/.test(log),
      "no transform failure anywhere in the tree",
      /Transform failed/.test(log) ? log.match(/ERROR.*/)?.[0]?.slice(0, 160) : "clean");
  }
}

console.log("\n=== 2. no stray syntax slips in the ritu sources ===");
{
  // A specific grep for the class of typo that actually happened, because a
  // generic parse check would also pass here -- `functionjali` parses as a
  // function NAMED "jali" with no space, which is why it is a Transform error
  // rather than a syntax error, and why a file-level parse would not have seen it.
  const files = [
    "src/ritu/motifs.jsx",
    "src/ritu/camera.js",
    "src/ritu/RituPiece.jsx",
  ];
  let slip = null;
  for (const f of files) {
    const p = path.join(ROOT, f);
    if (!existsSync(p)) continue;
    const src = readFileSync(p, "utf8");
    const m = src.match(/^\s*(export\s+)?function[A-Za-z_$]/m);
    if (m) slip = slip + f + ": " + m[0].trim();
  }
  ok(!slip, "every `function` is followed by a space before its name",
    slip || files.length + " files, no `functionname` slips");
}

console.log(failed
  ? `\n  ${failed} CHECK(S) FAILED\n`
  : `\n  the tree compiles: a syntax error cannot reach a render again\n\n`);
process.exit(failed ? 1 : 0);