#!/usr/bin/env node
/*
 * make_video.mjs -- one command from song + .lrc to a CHECKED deliverable.
 *
 *   node scripts/make_video.mjs song.mp3 song.lrc [--styled] [render flags...]
 *
 * The pipeline the workflow video calls the other 90%: the prompt (here, the
 * flags) is the small part; the gates around it are the product.
 *
 *   1. beats    scripts/detect_beats.py -> out/beats-<song>.json
 *               (word starts quantize to the grid; styled mode pulses on it)
 *   2. render   render.mjs with every flag passed through -- which itself
 *               runs the FONT GATE before any work: a font that cannot write
 *               the song fails in seconds, naming the words.
 *   3. critique scripts/critique.py verifies the rendered FILE: streams,
 *               duration, text present at sampled cues, pure plate, no
 *               edge-clip. A finished render is not a correct render.
 *
 * make_video consumes only: --no-beats, --skip-critique, --bpm <f>.
 * EVERYTHING else passes through to render.mjs unchanged (--styled, --font-file,
 * --font-slug, --mode, --length, --no-audio, --preview, ...). The output path is
 * pinned with --out so step 3 critiques the exact file step 2 wrote.
 *
 * Exit code: 0 only when the render succeeded AND the critique passed.
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);

const argv = process.argv.slice(2);
const has = (n) => argv.includes(n);
const val = (n) => {
  const i = argv.indexOf(n);
  if (i >= 0) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(n + "="));
  return eq ? eq.slice(n.length + 1) : null;
};

const NO_BEATS = has("--no-beats");
const SKIP_CRITIQUE = has("--skip-critique");
const FORCE_BPM = Number(val("--bpm"));

// Passthrough: drop what make_video consumes, keep everything else -- including
// values that belong to kept flags (--out X keeps X).
const CONSUMED = new Set(["--no-beats", "--skip-critique", "--bpm"]);
const passthrough = argv.filter((a, i) => {
  if (CONSUMED.has(a)) return false;
  const prev = argv[i - 1];
  if (prev && CONSUMED.has(prev) && !prev.startsWith("--bpm")) return false;
  if (prev === "--bpm") return false; // its value goes to the detector, not the renderer
  return true;
});

const positional = passthrough.filter((a, i) => {
  if (a.startsWith("--")) return false;
  const prev = passthrough[i - 1];
  return !(prev && prev.startsWith("--"));
});
const [audio, lrc] = positional;
if (!audio || !lrc || !fs.existsSync(audio) || !fs.existsSync(lrc)) {
  console.error(
    "usage: node scripts/make_video.mjs <song.mp3> <song.lrc> [--styled] [render flags...]\n" +
    "       (both files must exist; every other flag passes through to render.mjs)"
  );
  process.exit(2);
}

// The renderer gets every kept flag EXCEPT the two positional files (render.mjs
// takes them as its own positionals). Removed by identity, not by position:
// `--styled song.mp3 song.lrc` puts the files at index 1 and 2, and a slice(2)
// would silently forward a stray flag value as a file.
const renderPassthrough = (() => {
  const out = [];
  let seenAudio = false;
  let seenLrc = false;
  for (const a of passthrough) {
    if (!seenAudio && a === audio) { seenAudio = true; continue; }
    if (!seenLrc && a === lrc) { seenLrc = true; continue; }
    out.push(a);
  }
  return out;
})();

const STYLED = has("--styled");
const PREVIEW = has("--preview");
const NO_AUDIO = has("--no-audio");
const title = path.basename(audio).replace(/\.[^.]+$/, "");
const outDir = path.join(ROOT, "out");
fs.mkdirSync(outDir, { recursive: true });
// Pin the output so the critique checks the exact file the render wrote --
// including whether a previous render's file is what got verified, which is a
// real failure shape when the render crashes and an old file sits at the path.
const outFlag = val("--out");
const outPath = outFlag
  ? path.resolve(outFlag)
  : path.join(outDir, title + (STYLED ? "-styled" : "") + (PREVIEW ? "-preview" : "") + ".mp4");

function pythonCommand() {
  const candidates =
    process.platform === "win32"
      ? [["python", ["-c", "pass"]], ["py", ["-c", "pass"]], ["python3", ["-c", "pass"]]]
      : [["python3", ["-c", "pass"]], ["python", ["-c", "pass"]]];
  for (const [cmd, args] of candidates) {
    try {
      execFileSync(cmd, args, { stdio: "ignore", windowsHide: true });
      return cmd;
    } catch { /* next */ }
  }
  return null;
}

const rule = (label) =>
  console.log("\n== " + label + " " + "=".repeat(Math.max(0, 60 - label.length)));

const py = pythonCommand();

// -- 1. beats ----------------------------------------------------------------
let beatsFile = null;
if (!NO_BEATS) {
  rule("1/3  beats");
  if (!py) {
    console.log("  skipped: no Python on PATH (beats are an enhancement, not a gate)");
  } else {
    beatsFile = path.join(outDir, "beats-" + title + ".json");
    const args = [path.join(HERE, "detect_beats.py"), audio, beatsFile];
    if (Number.isFinite(FORCE_BPM) && FORCE_BPM > 0) args.push("--bpm", String(FORCE_BPM));
    const res = spawnSync(py, args, { stdio: "inherit", cwd: ROOT });
    if ((res.status || 0) !== 0) {
      console.warn("  detect_beats failed -- continuing WITHOUT beat sync.");
      beatsFile = null;
    }
  }
} else {
  console.log("\n(beats skipped: --no-beats)");
}

// -- 2. render (font gate runs inside) ---------------------------------------
rule("2/3  render");
const renderArgs = [
  path.join(ROOT, "render.mjs"),
  audio, lrc,
  "--out", outPath,
  ...(beatsFile ? ["--beats", beatsFile] : []),
  ...renderPassthrough, // every kept flag (and --out, if given -- ours wins by position)
];
const render = spawnSync(process.execPath, renderArgs, { stdio: "inherit", cwd: ROOT });
if ((render.status || 0) !== 0) {
  console.error("\n  render failed (exit " + render.status + "). Nothing to critique.");
  process.exit(render.status || 1);
}
if (!fs.existsSync(outPath)) {
  console.error("\n  render exited 0 but " + outPath + " does not exist.");
  process.exit(1);
}

// -- 3. critique --------------------------------------------------------------
rule("3/3  critique");
if (SKIP_CRITIQUE) {
  console.log("  skipped: --skip-critique. You are the feedback loop now.");
} else if (!py) {
  console.warn("  skipped: no Python on PATH. The file is NOT verified.");
} else {
  const args = [
    path.join(HERE, "critique.py"),
    outPath,
    "--lrc", lrc,
    "--mode", STYLED ? "styled" : "overlay",
  ];
  if (NO_AUDIO) {
    args.push("--no-audio");
    const len = Number(val("--length"));
    if (Number.isFinite(len) && len > 0) args.push("--audio-seconds", String(len));
  } else if (!PREVIEW) {
    args.push("--expect-audio");
  }
  const res = spawnSync(py, args, { stdio: "inherit", cwd: ROOT });
  if ((res.status || 0) !== 0) {
    console.error(
      "\n  The file rendered but did NOT pass critique (exit " + res.status + ").\n" +
      "  It exists at " + outPath + " -- inspect the named timestamps before\n" +
      "  deciding anything. Do not ship it as-is."
    );
    process.exit(1);
  }
}

// -- summary ------------------------------------------------------------------
rule("done");
const size = fs.statSync(outPath).size;
console.log("  deliverable : " + outPath + "  (" + (size / 1024 / 1024).toFixed(1) + " MB)");
console.log("  beats       : " + (beatsFile || "(none)"));
console.log("  critique    : " + (SKIP_CRITIQUE ? "SKIPPED" : py ? "PASSED" : "SKIPPED (no Python)"));
console.log(
  STYLED
    ? "  styled full-frame video -- plays as-is."
    : "  overlay -- Videosync2: layer blend Add or Screen, black disappears."
);
console.log("\n  Before shipping, LOOK at one frame (glyph identity is no script's job):");
console.log("    node render.mjs " + audio + " " + lrc + " --prepare-only");
process.exit(0);
