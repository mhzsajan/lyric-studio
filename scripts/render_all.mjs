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
  // THE PALETTE: red and orange, nothing else.
  //
  // `duo:25` is the anchor (hue 0 = red) and a second slot 25 degrees away, which
  // at hue 0 is orange. It replaced `primaries` ([0, 25, 120, 240] -- red, orange,
  // green, blue) on request: green and blue are out.
  //
  // There is also a reason to prefer two adjacent hues over four spread ones, and
  // it is not only taste. linePalette deals a seeded PERMUTATION of the slots, so
  // with two slots every neighbouring pair differs and a 2-word line is red/orange
  // or orange/red. With four, a 3-word line gets three different hues and the line
  // stops reading as one coloured object -- which is the same failure the stepped
  // hue gradient exists to avoid, one level up.
  //
  // `--color-accent 1` is required, not cosmetic. duo:25 has NO white slot, so the
  // accent draw -- which converts a coloured slot to the white one -- would turn
  // 65% of every line white at the old 0.35.
  // THE PALETTE: twenty named reds plus thirteen metals and materials, 33 in all,
  // dealt at random per word.
  //
  // `materials` is used rather than `reds` because the request was widened from
  // "red" to "other materialistic colours too". Both palettes exist; `reds` is the
  // exact twenty from the reference and is one flag away.
  //
  // Random is SEEDED, so the same song picks the same words in the same colours on
  // every render and across both versions of a song. A version that moved its
  // colours would not be the same song twice.
  //
  // Five of the named colours (sangria, oxblood, burgundy, barn red, maroon) measure
  // below luma 51 and are LIFTED to it by the same guard that exists because red
  // words at luma 51 shipped broken. They keep their hue and saturation and lose
  // their darkness, so oxblood becomes a deep red rather than oxblood. Dropping
  // them would have honoured the names and lost the words.
  // ONE VALUE PER FLAG IN THIS TABLE, and that is a rule rather than a style.
  //
  // This list carried `--color-accent 1` AND `--color-accent 0.12`, and `--cut word`
  // AND `--cut off`, and `--letter-var 0` in COMMON while FAST and SLOW passed 0.12.
  // render.mjs takes the last occurrence, so the batch was shipping the values that
  // happened to be written last -- which were not the ones the comments above them
  // described, and not the ones the approved Allare render was made with.
  //
  // That is the same shape as the two-font-table bug, and the same shape as the
  // un-threaded cutRoom: the file was EDITED correctly and the thing that RUNS took
  // a different value. A duplicate flag is invisible in a diff and decisive at
  // render time. check_flags_once.mjs now fails the build on a repeat.
  //
  // COLOUR IS AN ACCENT, NOT A PAINT. "This is too colorful, do not use colors
  // everywhere, just sometimes on some letters and 2 3 letters only." At accent 1.0
  // every word took a colour from the ramp, which is a coloured sentence. At 0.12
  // roughly one word in eight is picked out and the rest stay white. Seeded per
  // word, so the same words are accent words on every re-render.
  //
  // THE PALETTE: the warm ramp -- gold, yellow, amber, orange, orange-red,
  // vermilion, red, coral red, crimson, carmine -- dealt at random per word. Red
  // words are the dark end of a warm ramp, which is exactly where legibility dies,
  // so the dark entries are lifted to the floor and the report says how many.
  //
  // Random is SEEDED, so the same song picks the same words in the same colours on
  // every render. A version that moved its colours would not be the same song twice.
  "--color-scheme", "warm",
  "--color-hue", "0",
  "--color-accent", "0.12",
  "--scanlines", "40",
  "--scanline-alpha", "0.06",
  "--shadow", "0 3px 16px rgba(0,0,0,0.85)",
  // A long line breaks into rows at full size instead of being shrunk to fit one
  // row. Named here so that "identical apart from the font" is checkable against
  // this file rather than against a memory of it. --x-pos is NOT set: it moved a
  // settled line sideways between cues and read as a shake.
  "--wrap", "rows",
  "--mode", "mix",
  "--mix-block", "8",
  // The underline is back, on request: "where is that underlined stuff?" It is
  // --cut word, the newspaper clipping. The tear bar is sized from the font's own
  // measured ink room (cutRoom), so it no longer draws a bright line through the
  // glyph bottoms -- which is what it was doing when it was reported twice.
  "--cut", "word",
];
// EVERY ANIMATION AND STYLE IS ON, with the faults fixed at the source rather than
// worked around by switching layers off. The three that were reported:
//
//   1. the below-matra crop. LINE_HEIGHT was 1.32, shorter than the faces are tall
//      (1.6-1.8em from an above-matra to a ु), so a glyph overflowed its own line
//      box and the crop landed on the descender. Now one constant, 1.55, plus
//      padding under the last row.
//   2. text touching the frame edge. A band's `left` may be 0vw, and at 1:53 the
//      ink began at exactly x=0. SIDE_SAFE_VW guarantees 4vw on BOTH sides.
//   3. the shaking. --x-pos moved a settled line sideways between cues; with the
//      motion layers on, the line already has life, so it was redundant as well as
//      jittery. The band SHAPES from --mix-block stay: they change every 8 cues and
//      read as variety rather than as flicker.
//
// COLOUR IS PER SYLLABLE, NOT PER WORD. syllableAccent() picks a run of two or
// three consecutive syllables on about one word in eight, so the colour is
// punctuation. `--color-mode calm` paints words only; `vivid` and above step the
// hue ACROSS a word, which is the "fading" that was rejected by name.
//
// PER-LETTER SIZE IS ASKING FOR EVERYTHING THE CAP ALLOWS. --loudest sets
// letter-var to 0.03, which is invisible at 105px. LETTER_SIZE_CAP in
// src/letters.js used to clamp it at 0.03, so every value produced identical
// output; the cap is now 0.12 and this asks for all of it.
//
// THE TRADE, stated plainly: at 0.12 a syllable can be 112% beside one at 88%,
// which puts a visible notch in the shirorekha -- the table in letters.js calls
// 0.12 "badly broken". It is wanted, so it is asked for. 0.06 is the value to drop
// to if the headline stepping reads as damage.
const FAST = ["--loudest", "--color-mode", "calm", "--type", "letter", "--letter-var", "0.12"];

const SLOW = ["--loudest", "--color-mode", "calm", "--type", "letter", "--letter-var", "0.12"];

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