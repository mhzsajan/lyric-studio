// preflight.mjs -- prove every font in a batch PASSES its gate, before rendering.
//
//   node scripts\preflight.mjs                 # the fourteen
//   node scripts\preflight.mjs --one-per-song  # the seven
//
// WHY A PREFLIGHT AND NOT JUST "START THE BATCH"
// ----------------------------------------------
// A gate refusal is discovered at render time, and by then the batch has already
// spent minutes on earlier videos and the operator is waiting. Every refusal is a
// PER-FONT, PER-SONG fact -- CV Haha passes on Ow Amira and fails on Jam Na Maya
// on one missing codepoint -- so the whole plan can be proven in seconds, for
// nothing, before a single frame is encoded.
//
// It runs the same `render.mjs --report-only` the render itself runs, and reads
// the same gate. It is not a re-implementation of the gate; a probe that modelled
// the gate would drift from it, and then the probe would be the thing that is
// wrong. It spawns the real thing.
//
// It also prints the WIDTH TABLE each font resolves to, because the table is the
// thing that decides whether the type comes out at the house size, and a font
// falling back to the per-class defaults is the difference between a lyric and a
// caption -- with no error anywhere.

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SONGS = "H:\\Lyric Video Making Folder";
const FONTS = path.join(ROOT, "..", "nepali-legacy-fonts", "fonts");

const F = {
  yantramanav: ["UNICODE", path.join(FONTS, "yantramanav", "Yantramanav-Black.ttf")],
  arya: ["UNICODE", path.join(FONTS, "arya", "Arya-Bold.ttf")],
  kalam: ["UNICODE", path.join(FONTS, "kalam", "Kalam-Bold.ttf")],
  rajdhani: ["UNICODE", path.join(FONTS, "rajdhani", "Rajdhani-Bold.ttf")],
  arap007: ["PREETI", path.join(FONTS, "arap007", "ARAP007.TTF")],
  shreenath: ["PREETI", path.join(FONTS, "shreenath-bold", "Shreenath Bold.TTF")],
  pawang: ["PREETI", path.join(FONTS, "pawang", "PawanG.TTF")],
  mkali: ["PREETI", path.join(FONTS, "mkali", "MKali.TTF")],
  cvhaha: ["PREETI", path.join(FONTS, "cv-haha", "CV Haha.TTF")],
  himalaya: ["PREETI", path.join(FONTS, "himalayabold", "Himalayabold Regular.ttf")],
  katmandu: ["PREETI", path.join(FONTS, "katmandu", "Katmandu Regular.TTF")],
};

const SEVEN = [
  ["01 Allare BPM 120", "rajdhani"],
  ["02 Jam Na Maya Jam BPM 115", "arap007"],
  ["03 Kali Kali BPM 120", "pawang"],
  ["04 Ow Amira BPM 122", "cvhaha"],
  ["05 Ritu BPM 105", "arya"],
  ["06 Timilai Bhuleko BPM 110", "katmandu"],
  ["07 Wora Para BPM 115", "kalam"],
];

const FOURTEEN = [
  ["01 Allare BPM 120", "rajdhani"], ["01 Allare BPM 120", "kalam"],
  ["02 Jam Na Maya Jam BPM 115", "arap007"], ["02 Jam Na Maya Jam BPM 115", "shreenath"],
  ["03 Kali Kali BPM 120", "pawang"], ["03 Kali Kali BPM 120", "mkali"],
  ["04 Ow Amira BPM 122", "cvhaha"], ["04 Ow Amira BPM 122", "himalaya"],
  ["05 Ritu BPM 105", "arya"], ["05 Ritu BPM 105", "yantramanav"],
  ["06 Timilai Bhuleko BPM 110", "katmandu"], ["06 Timilai Bhuleko BPM 110", "pawang"],
  ["07 Wora Para BPM 115", "rajdhani"], ["07 Wora Para BPM 115", "kalam"],
];

const jobs = process.argv.includes("--one-per-song") ? SEVEN : FOURTEEN;

/**
 * The family a font registers under, read from the .ttf's own name table.
 *
 * The cache is keyed by FAMILY, not by filename, because that is what render.mjs
 * looks up -- it passes the family it will actually ask the browser for. Reading
 * it out of the file here keeps the two in step without either of them hardcoding
 * a list that can drift. "Yantramanav-Black.ttf" registers as "Yantramanav Black",
 * which is why one font in the batch silently fell back to the defaults while
 * its calibrated table sat in the cache under a friendlier name.
 */
function familyOf(file) {
  const r = spawnSync("py", ["-c", [
    "import sys",
    "from fontTools.ttLib import TTFont",
    "t = TTFont(sys.argv[1], fontNumber=0, lazy=True)",
    "n = [r.toUnicode() for r in t['name'].names if r.nameID == 1]",
    "print(n[0] if n else '')",
  ].join("\n"), file], { encoding: "utf8" });
  return (r.stdout || "").trim();
}

console.log("");
console.log("  preflight: " + jobs.length + " (font, song) pairs, each gated for real");
console.log("");

let refused = 0;
let noTable = 0;

for (const [folder, fontKey] of jobs) {
  const [cls, file] = F[fontKey];
  const dir = path.join(SONGS, folder);
  const lrc = readdirSync(dir).find((f) => /remotion_start\.lrc$/i.test(f));
  const audio = readdirSync(dir).find((f) => /\.(mp3|wav|m4a)$/i.test(f));
  const fontFlags = cls === "PREETI"
    ? ["--legacy-font", file, "--layout", "Preeti"]
    : ["--font-file", file];

  const r = spawnSync(process.execPath, [
    path.join(ROOT, "render.mjs"),
    path.join(dir, audio), path.join(dir, lrc),
    "--no-audio", "--length", "100",
    ...fontFlags,
    "--report-only",
  ], { cwd: ROOT, encoding: "utf8" });

  const log = (r.stdout || "") + (r.stderr || "");
  const okGate = r.status === 0;
  if (!okGate) refused++;

  // The width table, read from the CACHE rather than scraped from the output.
  //
  // The first version parsed `width em:` out of render.mjs's stdout and reported
  // "NO TABLE" for all seven fonts. render.mjs --report-only returns BEFORE the
  // width-table code runs, so there was never a line to find -- the preflight was
  // reporting a missing printout as a missing measurement, which is the exact
  // confusion this tool exists to end. The cache is the artefact; read the artefact.
  const w = JSON.parse(readFileSync(path.join(HERE, "width.json"), "utf8"));
  const fam = familyOf(file);
  const table = w[fam + " +song"] || w[fam];
  const hasTable = Boolean(table);
  if (!hasTable) noTable++;
  const em = hasTable
    ? (table.perChar != null
        ? "perChar " + table.perChar.toFixed(4) + "em"
        : "per-class")
    : "NO TABLE -- will render small";

  const reason = !okGate
    ? (log.match(/(\d+ key\(s\)[^\n]*)/) || log.match(/(\d+ of \d+ words[^\n]*)/) ||
       log.match(/(Unknown --[a-z-]+[^\n]*)/) || ["refused"])[0]
    : null;

  console.log(
    "  " + (okGate ? "PASS" : "FAIL") + "  " + fontKey.padEnd(12) +
    " " + cls.padEnd(8) + folder.slice(0, 28).padEnd(30) + em
  );
  if (reason) console.log("        " + String(reason).trim().slice(0, 96));
  if (reason) console.log("        " + String(reason).trim().slice(0, 96));
}

console.log("");
console.log("  " + (jobs.length - refused) + "/" + jobs.length + " pass the gate");
if (noTable) console.log("  " + noTable + " have NO measured width table and will render smaller than needed");
console.log("");
process.exit(refused ? 1 : 0);
