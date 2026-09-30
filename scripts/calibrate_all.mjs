// calibrate_all.mjs -- give every font in the batch a MEASURED width table.
//
//   node scripts\calibrate_all.mjs
//
// WHY THIS FILE EXISTS
// --------------------
// `scripts/width.json` had FOUR entries when the fourteen-video batch was
// planned, and none of them were Rajdhani, Kalam, Arya or any of the seven Preeti
// faces. Every one of those fonts therefore fell back to the per-class DEFAULTS,
// and the defaults are wrong in the direction that makes text small:
//
//   a Preeti font renders ASCII keys, all of which classify as `other` at 0.5em.
//   Measured against the real .ttf, those faces advance 0.22-0.25em per character.
//   The model over-predicts width by about TWICE, so the wrapper breaks roughly
//   twice as early, the line takes twice the rows, and `fitWrapped` shrinks the
//   type to fit them. That is the "the fonts are so small" report, and it is not
//   one bug in one font -- it is every font without a table.
//
// The fallback was already warned about in render.mjs ("the fallback is exactly
// the thing that made the delivered render too small") and the warning went out
// on every render and was read on none of them. The numbers existed; nobody was
// told to go and make them.
//
// WHAT IT DOES
// ------------
// Runs the existing calibrator, which measures in the real browser, once per font
// on a song that actually uses that font. It writes into the same width.json the
// renderer reads, so there is one table and one code path.
//
// It is idempotent: a font already in the cache with a low error is left alone
// unless --force. Calibrating is not free and the point is to do it once.

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SONGS = "H:\\Lyric Video Making Folder";
const FONTS = path.join(ROOT, "..", "nepali-legacy-fonts", "fonts");
const CACHE = path.join(HERE, "width.json");
const force = process.argv.includes("--force");

// The batch's eleven fonts, each with a song that uses it. The song matters: with
// --lrc the calibrator fits on that song's OWN lines, which is far better than a
// per-font average, and it is the only way the fit sees real conjuncts.
//
// Unicode fonts are calibrated on a song rendered with that font. Preeti fonts
// cannot be -- the song has to be transcoded first, and the transcode is what
// render.mjs does -- so those get a per-code-point table measured from the .ttf
// instead, by measure_legacy_width.py.
const JOBS = [
  { song: "01 Allare BPM 120", font: "Rajdhani", file: path.join(FONTS, "rajdhani", "Rajdhani-Bold.ttf"), kind: "unicode" },
  { song: "01 Allare BPM 120", font: "Kalam", file: path.join(FONTS, "kalam", "Kalam-Bold.ttf"), kind: "unicode" },
  { song: "05 Ritu BPM 105", font: "Arya", file: path.join(FONTS, "arya", "Arya-Bold.ttf"), kind: "unicode" },
  { song: "05 Ritu BPM 105", font: "Yantramanav", file: path.join(FONTS, "yantramanav", "Yantramanav-Black.ttf"), kind: "unicode" },
  { song: "02 Jam Na Maya Jam BPM 115", font: "ARAP007", file: path.join(FONTS, "arap007", "ARAP007.TTF"), kind: "legacy" },
  // "Shreenath Bold", not "Shreenath". The cache is keyed by the family the FONT
  // REGISTERS under, because that is what render.mjs looks up -- it passes
  // `legacy.family`, read out of the .ttf. Writing a table under a friendlier
  // short name produces a cache entry that is never read, which is the quietest
  // possible failure: the number is there, correct, and unused.
  { song: "06 Timilai Bhuleko BPM 110", font: "Shreenath Bold", file: path.join(FONTS, "shreenath-bold", "Shreenath Bold.TTF"), kind: "legacy" },
  { song: "03 Kali Kali BPM 120", font: "PawanG", file: path.join(FONTS, "pawang", "PawanG.TTF"), kind: "legacy" },
  { song: "03 Kali Kali BPM 120", font: "MKali", file: path.join(FONTS, "mkali", "MKali.TTF"), kind: "legacy" },
  { song: "04 Ow Amira BPM 122", font: "CV Haha", file: path.join(FONTS, "cv-haha", "CV Haha.TTF"), kind: "legacy" },
  { song: "04 Ow Amira BPM 122", font: "Himalayabold", file: path.join(FONTS, "himalayabold", "Himalayabold Regular.ttf"), kind: "legacy" },
  { song: "06 Timilai Bhuleko BPM 110", font: "Katmandu", file: path.join(FONTS, "katmandu", "Katmandu Regular.TTF"), kind: "legacy" },
];

let cache = {};
try {
  cache = JSON.parse(readFileSync(CACHE, "utf8"));
} catch {
  console.log("  width.json unreadable; starting a fresh one");
}

console.log("");
console.log("  " + JOBS.length + " fonts to measure; cache has " +
  Object.keys(cache).length + " entries" + (force ? "  (--force: all of them)" : ""));
console.log("");

for (const j of JOBS) {
  const dir = path.join(SONGS, j.song);
  const lrc = readdirSync(dir).find((f) => /remotion_start\.lrc$/i.test(f));
  const audio = readdirSync(dir).find((f) => /\.(mp3|wav|m4a)$/i.test(f));
  if (!lrc || !audio) {
    console.log("  " + j.font.padEnd(14) + " SKIP -- no song files in " + j.song);
    continue;
  }

  if (j.kind === "legacy") {
    const r = spawnSync("py", [
      path.join(HERE, "measure_legacy_width.py"),
      "--font-file", j.file,
      "--lrc", path.join(dir, lrc),
      "--layout", "Preeti",
      "--name", j.font,
      "--cache", CACHE,
    ], { encoding: "utf8" });
    const out = ((r.stdout || "") + (r.stderr || "")).trim().split("\n").pop();
    console.log("  " + j.font.padEnd(14) + (r.status === 0 ? " ok   " : " FAIL ") + out.slice(0, 88));
    continue;
  }

  const key = j.font + " +song";
  const have = cache[j.font + " +song"] || cache[j.font];
  if (!force && have && (have.worstError ?? 1) < 0.15) {
    console.log("  " + j.font.padEnd(14) + " cached   worst error " +
      ((have.worstError ?? 0) * 100).toFixed(1) + "%");
    continue;
  }

  const r = spawnSync(process.execPath, [
    path.join(HERE, "calibrate_width.mjs"),
    "--font", j.font,
    "--font-file", j.file,
    "--lrc", path.join(dir, lrc),
    "--audio", path.join(dir, audio),
    "--force",
  ], { encoding: "utf8", cwd: ROOT });
  const out = ((r.stdout || "") + (r.stderr || "")).trim().split("\n").filter(Boolean);
  console.log("  " + j.font.padEnd(14) + (r.status === 0 ? " ok   " : " FAIL ") +
    (out[out.length - 1] || "").slice(0, 88));
}

console.log("");
console.log("  cache now holds " +
  Object.keys(JSON.parse(readFileSync(CACHE, "utf8"))).length + " entries");

// EVERY font must be REACHABLE by the lookup render.mjs actually performs:
// `<family> +song`, then `<family>`. A table under any other key is a number
// that exists, is correct, and is never read -- which is quieter than a missing
// one, because nothing warns.
{
  const cache = JSON.parse(readFileSync(CACHE, "utf8"));
  const unreachable = [];
  for (const j of JOBS) {
    const hit = cache[j.font + " +song"] || cache[j.font];
    if (!hit) unreachable.push(j.font + "  (no <family> or <family> +song)");
  }
  if (unreachable.length) {
    console.log("  UNREACHABLE ENTRIES -- these will silently fall back to defaults:");
    for (const u of unreachable) console.log("    " + u);
  } else {
    console.log("  all " + JOBS.length +
      " fonts resolve by <family> or <family> +song -- none falls back");
  }
}
console.log("");
