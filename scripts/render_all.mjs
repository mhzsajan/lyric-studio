// render_all.mjs -- the seven songs, two videos each, every one gated.
//
//   node scripts\render_all.mjs --dry      # print the plan and exit
//   node scripts\render_all.mjs            # render whatever is missing
//   node scripts\render_all.mjs --force
//
// FOURTEEN RENDERS, AND WHY THE PLAN IS A TABLE AND NOT FOURTEEN COMMANDS
// ----------------------------------------------------------------------
// Fourteen hand-typed command lines is how one of them ends up with a different
// --size-var and produces a file that does not match its thirteen siblings, with
// nothing to show the difference. Here every job is built by one function from
// two data tables, so "identical apart from the font" is a property of the code
// rather than a promise about my typing.
//
// THE FONT CONSTRAINT, STATED PLAINLY
// -----------------------------------
// Four working UNICODE fonts exist: yantramanav, arya, kalam, rajdhani. Seven
// songs with non-repetitive fonts is therefore impossible -- there are not seven
// -- and the instruction was to use the known-good ones and accept a repeat.
//
// So each song gets a DIFFERENT PAIR, and the pairs rotate: no two consecutive
// songs lead with the same face, and a song's own two videos never match. Four
// unordered pairs exist (YA, AK, RY, KR), so three songs must share a pair with
// another. That is the arithmetic, and it is better to say it than to imply the
// seven fonts are distinct.
//
// WHY THE SLOW SONGS GET A DIFFERENT RECIPE
// -----------------------------------------
// Ritu (105 bpm) and Timilai Bhuleko (110) are the heartbroken ones. Two changes,
// both from the user's instruction that no dancing animation goes on them:
//
//   no --cut        torn clippings read playful
//   no --motion wild, no --word-anim mix
//                   `mix` deals from a pool containing drop, spin, tumble,
//                   wobble, swing, flip and zoom. Those are the dancing ones.
//                   Slow songs get --word-anim reveal (a rise into place) and
//                   --motion calm.
//
// And the colour goes the OTHER way from what you might expect: slow songs are
// the ones that get PER-LETTER colour, fast songs get per-word. That was your
// instruction, and it works -- a slow line holds long enough for the eye to read
// a gradient across a word, whereas on a fast line that detail is motion blur.
//
// NO OUTPUT FILTERS
// -----------------
// An earlier version piped this through `Select-Object -First 5`, which closes the
// PowerShell pipeline and kills the node process mid-render. It looked like a
// render failure -- right duration reported, no output file, exit 1 -- and cost a
// full re-run. Nothing here filters stdout.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SONGS_DIR = "H:\\Lyric Video Making Folder";
const OUT_DIR = "H:\\Lyric Video Making Folder\\RENDERED";
const FONTS = path.join(ROOT, "..", "nepali-legacy-fonts", "fonts");

// TEN confirmed fonts, in TWO CLASSES, and the class decides the flags.
//
//   UNICODE  native Devanagari codepoints. Rendered as-is with --font-file.
//            Structurally safe on all seven songs: no transcode, so no layout
//            that can be wrong, and no way for a word to come out misspelled.
//
//   PREETI   ZERO Devanagari codepoints -- by design. It renders by transcoding
//            the lyrics into the font's own ASCII key layout, which is lossy, so
//            it needs --legacy-font --layout Preeti AND the per-song safety
//            gate. A Preeti font on a song it cannot carry draws one word in two
//            typefaces with no error anywhere, and the gate refuses it.
//
// The class is not a stylistic preference here, it is a permission. `class` is
// read below and picks the flag set; a font is never given the wrong one, because
// --font-file on a Preeti file is a hard gate failure and --legacy-font on a
// Unicode file would transcode it into mojibake.
const FONTSET = {
  // UNICODE
  yantramanav: { class: "UNICODE", file: path.join(FONTS, "yantramanav", "Yantramanav-Black.ttf") },
  arya: { class: "UNICODE", file: path.join(FONTS, "arya", "Arya-Bold.ttf") },
  kalam: { class: "UNICODE", file: path.join(FONTS, "kalam", "Kalam-Bold.ttf") },
  rajdhani: { class: "UNICODE", file: path.join(FONTS, "rajdhani", "Rajdhani-Bold.ttf") },
  // PREETI
  arap007: { class: "PREETI", file: path.join(FONTS, "arap007", "ARAP007.TTF") },
  shreenath: { class: "PREETI", file: path.join(FONTS, "shreenath-bold", "Shreenath Bold.TTF") },
  pawang: { class: "PREETI", file: path.join(FONTS, "pawang", "PawanG.TTF") },
  mkali: { class: "PREETI", file: path.join(FONTS, "mkali", "MKali.TTF") },
  cvhaha: { class: "PREETI", file: path.join(FONTS, "cv-haha", "CV Haha.TTF") },
  himalaya: { class: "PREETI", file: path.join(FONTS, "himalayabold", "Himalayabold Regular.ttf") },
  katmandu: { class: "PREETI", file: path.join(FONTS, "katmandu", "Katmandu Regular.TTF") },
};

// Every common flag. `--size-preset medium` is the house size the user chose from
// the three-rung comparison: 105 / 0.08 / 0.05. Red and white only, duo at hue 0.
const COMMON = [
  "--size-preset", "medium",
  // THE PALETTE: red, orange, blue and a green tint, dealt across the line so
  // neighbouring words differ (linePalette is a seeded permutation, not a modulo,
  // so words 1 and 4 never land on the same hue).
  //
  // `primaries` is [0, 25, 120, 240] -- red, orange, green, blue. It is not
  // `triad`, which is [0, 120, 240] and has no orange in it; orange is the colour
  // that makes the set read as a palette rather than as three traffic lights.
  //
  // `--color-accent 1` matters here and was 0.35 for the red-and-white duo.
  // `primaries` has NO white slot, so the accent draw -- which converts a coloured
  // slot to the white one -- would have turned 65% of every line white. At 1.0
  // every word takes a colour from the set.
  "--color-scheme", "primaries",
  "--color-hue", "0",
  "--color-accent", "1",
  // HOW OFTEN a word takes the red. Measured over Kali Kali's 48 cues: at 1.0
  // exactly 50% of words are red, which is a COLOURED SENTENCE with white in it.
  // At 0.35 it is ~15% of words and about half the lines carry one accent -- so a
  // line is usually one word picked out, sometimes none, and never a block of
  // colour. Seeded per word, so the same words are accent words in both versions
  // of a song and on every re-render.
  "--scanlines", "40",
  "--scanline-alpha", "0.06",
  "--shadow", "0 3px 16px rgba(0,0,0,0.85)",
  // A long line breaks into rows at full size instead of being shrunk to fit one
  // row, and each line's horizontal placement varies per cue. Both are on by
  // default in render.mjs; they are named here so that "identical apart from the
  // font" is checkable against this file rather than against a memory of it.
  "--wrap", "rows",
  "--x-pos",
  "--mode", "mix",
  "--mix-block", "8",
  // From NO_GLYPH_MOTION. Spread into COMMON so both treatments get it and it
  // cannot be forgotten on one path -- which is how the two font tables drifted
  // apart in the first place.
  "--size", "105",
  "--size-var", "0",
  "--size-drift", "0",
  "--letter-var", "0",
  "--size-mode", "off",
  "--cut", "off",
  "--type", "off",
  "--depth", "off",
  "--motion", "off",
  "--word-anim", "off",
  "--letter-anim", "off",
];

// EVERY PER-SYLLABLE TRANSFORM IS OFF. This is a correctness retreat, not a taste
// decision, and the reason is specific.
//
// The report was: "all the upper section of this text, तिमीले becomes तमाला" and
// "texts that have lower characters, मायालु becomes mayal" -- and then, decisively,
// "not everywhere but at certain sections of the song, half way correct and half
// way not". Losing BOTH the above-matras (ी े ै) and the below-matras (ु ू), in
// SOME sections only, is one fault and not two: something is altering the glyphs
// between syllables, so the parts that stick out past a consonant lose their
// attachment and the word reads as a different word.
//
// RULED OUT BY MEASUREMENT, not by reasoning:
//   - the font. fontTools says the ink for these strings is 0.98em above the
//     baseline and 0.30em below, and the rendered block is 131px for a 105px font
//     against 135px needed. Nothing is clipped and no matra is absent from the face.
//   - the frame edge. 24 sampled frames, every one of them 450-600px clear of the
//     top and 330-500px clear of the bottom. scripts/bbox_report.py measures it.
//   - grapheme splitting. splitGraphemes("दुईतर्फी") is ["दु","ई","त","र्फी"] -- the
//     conjunct र्फ and the ी matra are both intact inside one cluster.
//   - per-word and per-letter SIZE. --size-var 0 --size-drift 0 --letter-var 0
//     --size-mode off changed nothing; the fault is still there.
//   - the tear bar, which is at the BOTTOM and was already fixed.
//
// So the remaining suspects are the layers that transform a syllable relative to
// its neighbours: --cut, --type, --depth, --motion, --word-anim, --letter-anim.
// Devanagari's shirorekha is continuous across a word, which is why this repo has
// an entire rule about it (gotcha 8) -- and every one of those layers is a
// per-syllable transform wearing a licence to move ink.
//
// Given a deadline, the right move is to ship what is PROVEN correct and add
// effects back one at a time, each verified by eye, rather than ship a treatment
// that mangles words. What survives below is everything that does not touch glyph
// geometry: the four Unicode faces, the rows wrap, the x-pos variety, the mix band
// shapes, the red/white duo at the corrected luminance floor, and the scanlines.
//
// To put a layer back, add it to FAST or SLOW and re-render ONE song, then look at
// a magnified crop of a word with a pre-base i-matra and a below-matra -- दुईतर्फी
// and मायालु are the two that exposed this, so they are the two to check.
const NO_GLYPH_MOTION = [
  // One size for every glyph in the frame. See above for why this is not optional.
  "--size", "105",
  "--size-var", "0",
  "--size-drift", "0",
  "--letter-var", "0",
  "--size-mode", "off",
  // Nothing that moves or clips a syllable relative to its neighbours.
  "--cut", "off",
  "--type", "off",
  "--depth", "off",
  "--motion", "off",
  "--word-anim", "off",
  "--letter-anim", "off",
];

// FAST and SLOW now differ only in which colour level paints, and per-letter
// colour is off in both because `--color-mode vivid` steps hue ACROSS a word --
// which is a per-letter transform, and is under the same suspension as the rest.
const FAST = ["--color-mode", "calm"];

const SLOW = ["--color-mode", "calm"];

// [folder, song, seconds, treatment, fontV1, fontV2]
// `seconds` is PROBED by scripts/plan.mjs, never typed from memory.
//
// NO FILENAME APPEARS IN THIS TABLE, AND THAT IS THE POINT. Three of the seven
// songs are named in Devanagari, and this file used to spell those names out as
// literals. A PowerShell `Get-Content -Raw` | `Set-Content` round-trip -- run for
// tidiness while editing an unrelated line -- re-encoded them as Latin-1, and the
// batch died with ENOENT on exactly the three Nepali songs while rendering the
// other four without complaint. Silent on four, fatal on three: the worst ratio
// available, and it came from a command that was not trying to touch them.
//
// So the names are DISCOVERED, at run time, from the folder. There is no
// non-ASCII left in this file to corrupt, and a re-tapped or renamed song cannot
// break the batch. scripts/gate_case.mjs and silent_cues.mjs do the same thing for
// the same reason.
const JOBS = [
  ["01 Allare BPM 120", "Allare", 417.1, FAST, "arya", "kalam"],
  ["02 Jam Na Maya Jam BPM 115", "Jam Na Maya Jam", 295.4, FAST, "kalam", "rajdhani"],
  ["03 Kali Kali BPM 120", "Kali Kali", 409.1, FAST, "yantramanav", "arya"],
  ["04 Ow Amira BPM 122", "Ow Amira", 664.5, FAST, "rajdhani", "yantramanav"],
  ["05 Ritu BPM 105", "Ritu", 293.4, SLOW, "arya", "kalam"],
  ["06 Timilai Bhuleko BPM 110", "Timilai Bhuleko", 323.3, SLOW, "kalam", "rajdhani"],
  ["07 Wora Para BPM 115", "Wora Para", 261.5, FAST, "yantramanav", "kalam"],
];

/**
 * A song's real filenames, discovered from its folder.
 *
 * Every entry is required to exist and to be unambiguous. A missing file is an
 * error that says WHICH file and WHICH folder, because the alternative -- letting
 * render.mjs fail on a mangled path -- says neither and looks like a corrupt
 * install.
 */
function filesFor(folder) {
  const dir = path.join(SONGS_DIR, folder);
  if (!fs.existsSync(dir)) {
    throw new Error("song folder not found: " + dir);
  }
  const all = fs.readdirSync(dir);
  const pick = (re, what) => {
    const hits = all.filter((f) => re.test(f));
    if (hits.length === 0) throw new Error("no " + what + " in " + dir);
    if (hits.length > 1) {
      throw new Error("more than one " + what + " in " + dir + ": " + hits.join(", "));
    }
    return hits[0];
  };
  return {
    audio: pick(/\.(mp3|wav|m4a)$/i, "audio file"),
    lrc: pick(/remotion_start\.lrc$/i, ".remotion_start.lrc"),
    ends: pick(/remotion_end\.lrc$/i, ".remotion_end.lrc"),
  };
}

const dry = process.argv.includes("--dry");
const force = process.argv.includes("--force");

/**
 * SEVEN, one per song, mixing both font classes.
 *
 * The fourteen are two per song. These are one per song, chosen so that BOTH
 * classes are used and so that every Preeti font here is on a song its gate
 * actually passes -- which is not every song:
 *
 *   Allare, Ritu, Wora Para   UNICODE only. All three contain pre-base i-matra
 *                             words the shared Preeti layout cannot express.
 *   Jam Na Maya               ARAP007 only. It is one of two Preeti faces that
 *                             cover this song; PawanG, MKali, CV Haha,
 *                             Himalayabold and Katmandu all fail its font half
 *                             on U+00CC.
 *
 * The font gate proves the rest at render time and refuses the job if it does
 * not, so this list is a statement of intent and the gate is the authority.
 */
// THE FONTS HERE ARE THE FOUR UNICODE FACES, AND THAT IS A CORRECTNESS DECISION.
//
// Every Preeti face is out of the batch. CV Haha draws the wrong glyphs for Ow
// Amira, and the font gate cannot catch that class, because the gate reads cmap
// tables and "correct" is a claim about shape. Four songs were re-rendered on
// unverified faces before that was measured by eye.
//
// NOTE FOR THE NEXT EDIT: this is NOT the same list as JOBS above. There are two
// tables -- JOBS drives the 7-vs-14 plan, SEVEN drives --one-per-song -- and they
// are read by different code paths. Changing only JOBS does nothing to
// --one-per-song, which is how a font rotation was committed, verified in a dry
// run, and then rendered with the old fonts anyway. If you change one, change
// both, and check the plan output rather than the source.
const SEVEN = [
  ["01 Allare BPM 120", "Allare", "arya"],
  ["02 Jam Na Maya Jam BPM 115", "Jam Na Maya Jam", "kalam"],
  ["03 Kali Kali BPM 120", "Kali Kali", "yantramanav"],
  ["04 Ow Amira BPM 122", "Ow Amira", "rajdhani"],
  ["05 Ritu BPM 105", "Ritu", "arya"],
  ["06 Timilai Bhuleko BPM 110", "Timilai Bhuleko", "kalam"],
  ["07 Wora Para BPM 115", "Wora Para", "yantramanav"],
];

// Flatten to one entry per VIDEO, so the gate and the log speak in videos --
// which is what a caller thinks in -- while the plan stays in songs.
const work = [];
if (process.argv.includes("--one-per-song")) {
  for (const [folder, song, font] of SEVEN) {
    const job = JOBS.find((j) => j[0] === folder);
    if (!job) { console.error("  SEVEN names a folder not in JOBS: " + folder); process.exit(2); }
    work.push({ folder, song, ...filesFor(folder), secs: job[2], treatment: job[3], font, v: 1 });
  }
} else {
  for (const [folder, song, secs, treatment, f1, f2] of JOBS) {
    const f = filesFor(folder);
    work.push({ folder, song, ...f, secs, treatment, font: f1, v: 1 });
    work.push({ folder, song, ...f, secs, treatment, font: f2, v: 2 });
  }
}



console.log("\n  " + work.length + " videos from " + JOBS.length + " songs");
console.log("  out: " + OUT_DIR + "\n");
for (const j of work) {
  const kind = j.treatment === SLOW ? "SLOW" : "fast";
  console.log("    " + j.song.padEnd(18) + " v" + j.v + "  " +
    j.font.padEnd(13) + kind + "   " + j.secs.toFixed(0) + "s");
}
console.log("");

if (dry) process.exit(0);

fs.mkdirSync(OUT_DIR, { recursive: true });

let made = 0;
const failed = [];

for (let i = 0; i < work.length; i++) {
  const j = work[i];
  const dir = path.join(SONGS_DIR, j.folder);
  const out = path.join(OUT_DIR, j.song + " - " + j.font + " - v" + j.v + ".mp4");
  const label = j.song + " v" + j.v + " / " + j.font;
  const n = String(i + 1).padStart(2) + "/" + work.length;

  const font = FONTSET[j.font];
  if (!font || !fs.existsSync(font.file)) {
    console.log("  [" + n + "] MISSING FONT  " + label);
    failed.push(label + " (font)");
    continue;
  }

  // The class picks the flags. Passing the wrong pair is not a style error, it is
  // a corruption: --font-file on a Preeti file fails the gate outright, and
  // --legacy-font on a Unicode file would transcode it into mojibake with no
  // error at all. So the two sets are built here and never mixed by hand.
  const fontFlags = font.class === "PREETI"
    ? ["--legacy-font", font.file, "--layout", "Preeti"]
    : ["--font-file", font.file];

  if (!force && fs.existsSync(out) && fs.statSync(out).size > 100000) {
    console.log("  [" + n + "] skip   " + label);
    continue;
  }

  console.log("  [" + n + "] start  " + label);
  const t0 = Date.now();

  const r = spawnSync(process.execPath, [
    path.join(ROOT, "render.mjs"),
    path.join(dir, j.audio),
    path.join(dir, j.lrc),
    "--no-audio",
    "--length", String(j.secs),
    ...fontFlags,
    "--out", out,
    ...COMMON,
    ...j.treatment,
  ], { cwd: ROOT, stdio: "pipe", encoding: "utf8" });

  const log = (r.stdout || "") + (r.stderr || "");
  if (r.status !== 0 || !fs.existsSync(out)) {
    console.log("      RENDER FAILED (exit " + (r.status ?? "?") + ")");
    for (const line of log.split("\n").filter((l) => /rror|ends\s+:|refus|Unknown/i.test(l)).slice(0, 4)) {
      console.log("        " + line.trim().slice(0, 104));
    }
    failed.push(label);
    continue;
  }

  // THE GATE. Stage 4 of the pipeline: decode EVERY frame and fail if any lyric
  // is visible outside its own [start, end]. This is what makes running every
  // layer at full strength safe -- `sequence` and the typed-on reveal both
  // deliberately DELAY words, which is the effect and also the one thing that
  // could put a word on screen after its line ended.
  const scan = spawnSync("py", [
    path.join(ROOT, "scripts", "scan_visibility.py"),
    out,
    path.join(dir, j.lrc),
    path.join(dir, j.ends),
    "--lit", "12",
  ], { cwd: ROOT, stdio: "pipe", encoding: "utf8" });

  const scanLog = (scan.stdout || "") + (scan.stderr || "");
  const mins = ((Date.now() - t0) / 60000).toFixed(1);

  if (scan.status === 0) {
    const mb = (fs.statSync(out).size / 1048576).toFixed(1);
    console.log("      ok  " + mb + " MB in " + mins + "m  -- every frame inside its cue");
    made++;
  } else {
    console.log("      SCAN FAILED -- a lyric is visible outside its own [start, end]");
    for (const line of scanLog.split("\n").filter((l) => /overshoot|interval|OK:/i.test(l)).slice(0, 3)) {
      console.log("        " + line.trim().slice(0, 104));
    }
    failed.push(label + " (scan)");
  }
}

console.log("\n  " + made + " passed, " + failed.length + " failed");
if (failed.length) console.log("  failed: " + failed.join(", "));
console.log("  out: " + OUT_DIR + "\n");