// check_all.mjs -- run every fast check, and report the ones it skipped.
//
// WHY THIS FILE EXISTS
// --------------------
// There are 18 check scripts. AGENTS.md used to list six of them and say "All
// six are seconds", which is how a repo ends up with a check suite nobody runs
// in full -- the list in the front door was shorter than the suite, so "I ran
// the checks" meant "I ran the ones I could remember". check_doc_refs.mjs now
// fails on exactly that gap, which is a check complaining about its own
// neighbours; this runner is the other half of the fix, so the full set is one
// command and its output is the list.
//
// WHAT IS AND IS NOT HERE
// -----------------------
// There are THREE kinds of check in this repo, and lumping them together is how
// a suite ends up with three permanent failures nobody can act on.
//
//   1. SELF-CONTAINED SUITES -- pure functions of the source. No rendered file,
//      no audio, no font. These are the ones that must be green before you
//      commit anything, and they all run here in seconds.
//   2. SONG TOOLS -- take a .lrc on the command line and report about THAT
//      song. check_song.mjs and check_timing.mjs are these. They exit non-zero
//      with a usage message when given no song, which in a runner is a failure
//      of the runner, not of the code.
//   3. FILE CHECKS -- verify a rendered .mp4 or a specific .ttf. Nothing to
//      verify before a render exists.
//
// Groups 2 and 3 are listed and skipped loudly rather than silently omitted.
// `make_video.mjs` runs the two that matter (critique.py, scan_visibility.py)
// as pipeline stages 3 and 4.
//
//   node scripts/check_all.mjs
//   node scripts/check_all.mjs --song "G:\...\song.lrc"   # also run the tools
//   node scripts/check_all.mjs --verbose                 # show each suite's output
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const VERBOSE = process.argv.includes("--verbose");
const songArg = (() => {
  const i = process.argv.indexOf("--song");
  return i >= 0 ? process.argv[i + 1] : null;
})();

// Run with no argument, so a check that reads argv sees argv.length === 0.
// check_flag_defaults.mjs is specifically about that (gotcha 28), and passing
// this runner's own flags through would be the bug it exists to catch.
const run = (file, args = []) => {
  try {
    const out = execFileSync(process.execPath, [path.join(HERE, file), ...args], {
      cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status === undefined ? 1 : e.status, out: (e.stdout || "") + (e.stderr || "") };
  }
};

// Group 2: need a song, so they cannot be discovered by filename alone.
const SONG_TOOLS = new Set(["check_song.mjs", "check_timing.mjs"]);

const all = fs.readdirSync(HERE)
  .filter((f) => /^check_.*\.mjs$/.test(f) && f !== "check_all.mjs")
  .sort();
const fast = all.filter((f) => !SONG_TOOLS.has(f));
const songTools = all.filter((f) => SONG_TOOLS.has(f));

// Group 3: file checks. Named so the skip is a printed line, not an absence.
const needsAFile = [
  ["check_ends.py", "which end times were really applied -- needs a render"],
  ["check_output.py", "verify a rendered file -- needs a render"],
  ["check_font_cmap.py", "does the FONT have ink for every key -- needs a .ttf"],
];

const report = (f, code, out, ms) => {
  const label = f.replace(/^check_|\.mjs$/g, "").padEnd(16);
  if (code === 0) {
    console.log("  PASS  " + label + "  " + (ms < 900 ? ms + "ms" : (ms / 1000).toFixed(1) + "s"));
    if (VERBOSE) out.split("\n").forEach((l) => { if (l.trim()) console.log("          " + l.trimEnd()); });
  } else {
    console.log("  FAIL  " + label + "  " + (ms < 900 ? ms + "ms" : (ms / 1000).toFixed(1) + "s"));
    out.split("\n").forEach((l) => { if (l.trim()) console.log("          " + l.trimEnd()); });
    return true;
  }
  return false;
};

console.log("\n=== 1. self-contained suites (" + fast.length + ") -- must be green ===\n");
const failed = [];
for (const f of fast) {
  const t0 = Date.now();
  const { code, out } = run(f);
  if (report(f, code, out, Date.now() - t0)) failed.push(f);
}

console.log("\n=== 2. song tools (" + songTools.length + ") -- need a .lrc ===");
if (songArg) {
  if (!fs.existsSync(songArg)) {
    console.log("  FAIL  --song path does not exist: " + songArg);
    failed.push("--song");
  } else {
    for (const f of songTools) {
      const t0 = Date.now();
      const { code, out } = run(f, [songArg]);
      if (report(f, code, out, Date.now() - t0)) failed.push(f);
    }
  }
} else {
  for (const f of songTools) {
    console.log("  skip  " + f.replace(/^check_|\.mjs$/g, "").padEnd(16) +
      "  reports on ONE song; pass --song <file.lrc> to run it");
  }
  console.log("        These are tools, not gates. A song's own result is not a repo state.");
}

console.log("\n=== 3. file checks (3) -- need a render or a font file ===");
for (const [f, why] of needsAFile) {
  console.log("  skip  " + f.replace(/^check_|\.py$/g, "").padEnd(16) + "  " + why);
}
console.log("        critique.py and scan_visibility.py are pipeline stages 3 and 4, run by");
console.log("        make_video.mjs on every real render -- not by this suite.");

console.log("\n" + (failed.length
  ? "  " + failed.length + " SUITE(S) FAILED: " + failed.join(", ") + "\n"
  : "  all " + fast.length + " fast suites passed\n"));
process.exit(failed.length ? 1 : 0);
