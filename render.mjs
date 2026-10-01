#!/usr/bin/env node
/*
 * render.mjs -- one command from "song.mp3 + lyrics.lrc" to a transparent
 * lyric overlay you can drop onto a Videosync2 layer.
 *
 *   node render.mjs <audio> <lyrics.lrc> [options]
 *
 * Options
 *   --out <file>        output path (default: out/<song>.mp4)
 *   --preview           fast, small, no alpha -- for checking timing only
 *   --no-audio          text-only overlay: no audio track in the output
 *   --font <family>     font family to render with (must be installed)
 *   --font-file <ttf>   render with a local .ttf, no transcoding at all
 *   --font-slug <slug>  use a font + its generated layout from the font repo
 *   --fonts-repo <dir>  where that repo is (default: ../nepali-legacy-fonts)
 *   --style <name>      pin every line to one animation instead of mixing
 *   --position <pos>    top | center | bottom        (default center)
 *   --size <px>         font size                    (default 104)
 *   --color <#hex>      text colour                  (default #ffffff)
 *   --seed <text>       animation seed (default: song title from the .lrc)
 *   --report-only       print the cue list and exit -- no render
 *   --ends <file>       end timings; by default looked for beside the .lrc as
 *                       <song>.remotion_end.lrc, then <song>.ends.txt. With no
 *                       ends file the render STOPS rather than estimating
 *                       every line from the next line's start; pass
 *                       --allow-missing-ends to mean it
 *   --batch <dir>       render every audio+lrc pair in <dir>
 *   --styled            full-frame styled video (LyricStyled): painted
 *                       background, title cards, white halo, mix placement --
 *                       the house style in styles/house.md
 *   --style-profile <j> style profile JSON (default styles/default.json)
 *   --beats <json>      beat times from scripts/detect_beats.py; word starts
 *                       quantize to the grid and the styled bg pulses on beats
 *   --beat-tol <s>      how far a word may move to snap (default 0.4)
 *   --skip-font-gate    render without proving the font can write the song
 *                       (an emergency hatch; the gate is the fix for two
 *                       shipped wrong-text videos)
 *
 * Why --preview exists: ProRes 4444 at 1080p60 is roughly 1.5 GB for a
 * four-minute song and takes minutes to encode. Preview renders in seconds at
 * quarter size so you can confirm the timings before committing to a long one.
 *
 * Console output is deliberately ASCII-only: a Windows console will otherwise
 * render box-drawing characters as mojibake.
 */

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MOTION_LEVELS } from "./src/motion.js";
import { WORD_ANIMS, LETTER_ANIMS, STYLE_ANIMS } from "./src/anim-pools.mjs";
// The entire interface to the font repository. Everything this renderer knows
// about fonts -- which are usable, and how to encode for them -- it asks for
// there rather than keeping here.
import {
  findFontsRepo, checkFont, printReport, fontRepoScript, fontRepoScriptPath,
  FONTS_REPO_HELP,
} from "./scripts/font_ref.mjs";
// The composition-layer levels. DEPTH_LEVELS lives in src/depth.js next to the
// implementations, so the validator and the code cannot disagree -- the same
// reason the word/letter pools moved to src/anim-pools.mjs.
import { DEPTH_LEVELS } from "./src/depth.js";

// --color-mode levels, from src/color.js. Validated here against the real list
// for the same reason --depth is: an unknown level must be an error, not a
// silent "off", because "you asked for colour and got white" is indistinguishable
// from success at the command line.
import { COLOR_LEVELS, COLOR_SCHEMES } from "./src/color.js";

// The cut-paper levels. Same shape of argument as --depth and --color-mode:
// an unknown level is an error rather than a silent "off".
import { CUT_LEVELS } from "./src/cut.js";

// The typing levels. Declared here rather than in src/typing.js only so the
// error message is generated from the same list the component validates against
// -- the anim-pools.mjs lesson, which was a pool that grew while the validator
// rejected every new entry.
import { TYPE_LEVELS } from "./src/typing.js";

// Which CLI flag owns each prop, so --loudest can ask "was this asked for?"
// without a second hand-written list. A copy of this map inside the loudest
// block is how it silently overwrote itself the first time.
const CLI_FOR_PROP = {
  depth: "--depth",
  motion: "--motion",
  wordAnim: "--word-anim",
  letterAnim: "--letter-anim",
  letterVar: "--letter-var",
  sizeMode: "--size-mode",
  mode: "--mode",
  colorMode: "--color-mode",
  colorScheme: "--color-scheme",
  cut: "--cut",
  type: "--type",
  stroke: "--stroke",
};
const WORD_ANIM_LIST = WORD_ANIMS;
const LETTER_ANIM_LIST = LETTER_ANIMS;
const STYLE_ANIM_LIST = STYLE_ANIMS;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GENERATED = path.join(HERE, "src", "lyrics.generated.js");
const PUBLIC = path.join(HERE, "public");

// The style list is the one in src/anim-pools.mjs, which is also where
// --word-anim and --letter-anim come from. This used to be a local copy, which
// is how every newly added effect ended up rejected by its own validator.
const STYLES = STYLE_ANIMS;

// -- args ------------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (name) => {
  // Support BOTH "--name value" and "--name=value": only parsing the space
  // form made "--fps=60" silently return null and fall back to the default
  // (found via --debug-args: props said fps:30 while the user asked for 60).
  const i = argv.indexOf(name);
  if (i >= 0) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(name + "="));
  return eq ? eq.slice(name.length + 1) : null;
};
const has = (name) => argv.includes(name);

// GOTCHA 28 -- Number(null) IS 0, NOT NaN. An absent numeric flag read through
// Number(flag("--x")) yields 0, and `Number.isFinite(0)` is TRUE, so the
// "flag not given -> use my default" branch never fires: the flag silently
// takes its own minimum value instead. This shipped twice here.
//
//   --beat-tol    absent -> 0 -> which DISABLES beat snapping entirely. The
//                 beats.json was loaded, printed, and then thrown away: a
//                 feature that reported itself as ON in the log and did
//                 nothing.
//   --size-var    absent -> 0 -> per-word size variation silently OFF, while
//                 AGENTS.md and the README both document 0.15 as the default.
//                 "Passing nothing" was not the documented behaviour.
//
// So numeric flags are read through numFlag(), which returns NaN for "absent"
// and only a real number otherwise. Every numeric default then works, and 0
// remains available as an explicit value.
const numFlag = (name) => {
  const raw = flag(name);
  if (raw === null || raw === undefined || raw === "") return NaN;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
};

const positional = argv.filter((a, i) => {
  if (a.startsWith("--")) return false;
  const prev = argv[i - 1];
  return !(prev && prev.startsWith("--") && prev !== "--batch");
});

const PREVIEW = has("--preview");
const NO_AUDIO = has("--no-audio");
const REPORT_ONLY = has("--report-only");
const PREPARE_ONLY = has("--prepare-only");
const STYLED = has("--styled");
const BEATS_FILE = flag("--beats");
const BEAT_TOL = numFlag("--beat-tol");   // NaN when absent (gotcha 28)
const STYLE_PROFILE_FILE = flag("--style-profile");
const SKIP_FONT_GATE = has("--skip-font-gate");

// mp4 (default): H.264, white text on BLACK background -- no alpha possible
//   in mp4, so the consumer keys it with Add/Screen blend (Videosync2: set
//   the layer blend to Add). Tiny files, plays everywhere.
// mov: ProRes 4444 true alpha for layer hosts that read the alpha channel.
const FORMAT = (flag("--format") || "mp4").toLowerCase();
if (!["mp4", "mov"].includes(FORMAT)) {
  console.error('  Unknown --format "' + FORMAT + '". Use mp4 or mov.');
  process.exit(1);
}

// --legacy-font ams.manthan.ttf: render through a Preeti-era font by
// converting the Unicode lyrics to that font's key sequences first. Needs
// python + npttf2utf, both from the FONT repo (scripts/lrc_legacy.py there).
  // Pair with --font <family>.
const LEGACY_FONT = flag("--legacy-font");
const FONT_FILE_ARG = flag("--font-file");
const BATCH = flag("--batch");

// --font-slug ams-manthan: look a font up in the sibling font repo and use it.
// The layouts used to be vendored here, which meant two copies of every map and
// no way to tell which was current. The vendored copy went stale in exactly the
// way you would expect -- it still carried the pre-fix i-matra encoding, so ि
// produced a stray KA and रिसले rendered as किस्तो. Reading from the font repo
// makes that class of bug impossible rather than merely fixed.
//
// Point somewhere else with --fonts-repo, or place the repo as a sibling
// directory named nepali-legacy-fonts.
const FONT_SLUG = flag("--font-slug");

// The font repository. All font knowledge -- layouts, the encoder, and the
// verdicts on which fonts actually work -- lives there. This repository renders
// video and asks. `findFontsRepo` returns null when it is absent rather than
// throwing, because a Unicode font needs none of it; the legacy path reports the
// absence at the point where it actually matters.
const FONTS_REPO = findFontsRepo(flag("--fonts-repo"));

// --strict-fonts decides what a non-working font does to a render.
//
// Default ON: a deliverable should not be built from a font nobody has looked
// at. But `untested` exists because fonts are still being tested, and a renderer
// that refuses untested fonts cannot be used to test them -- so --no-strict-fonts
// warns and proceeds. A font the font repo records as *broken* is refused either
// way: rendering it costs six minutes to produce a file already documented as
// spelling words wrong.
const STRICT_FONTS = has("--no-strict-fonts") ? false : true;

// What each non-working state means, in the words the font repo uses. Kept here
// as wording only -- the STATES and their rules come from the font repo, and
// duplicating the rules is the second copy this split exists to remove.
const FONT_RISK_TEXT = {
  untested: "never rendered and never eye-checked",
};

// These are opposite operations, so asking for both is a mistake worth naming
// rather than a precedence question. Checked at the top of run(), before
// either font is resolved: the legacy path fails first on a bad file and would
// otherwise report "font not found" for a request that was never going to work.
function refuseBothFonts() {
  console.error(
    "  --font-file and --legacy-font are two different things and cannot be\n" +
      "  combined. --font-file uses the font as-is; --legacy-font converts the\n" +
      "  lyrics to that font's key sequences first. A Unicode face needs no\n" +
      "  layout and has no risk of wrong letters, which is usually the one you\n" +
      "  want: see the Font section of the README."
  );
  process.exitCode = 1;
}

// Which key layout the legacy font speaks. npttf2utf knows five; a font
// outside those needs a map generated from the publisher's character table
// in the font repo, and passed here with --layout-file. Preeti is
// NOT a safe default for an arbitrary Nepali font: feeding Preeti keys to
// AMS Manthan renders collapsed glyphs and literal `==` instead of the danda.
const LEGACY_LAYOUT = flag("--layout") || "Preeti";
const LEGACY_LAYOUT_FILE = flag("--layout-file") || null;

// HOW LONG THE VIDEO IS
// --------------------
// calculateMetadata sets the length to max(audio length, last cue end). When
// the audio is muxed in, that probe is exact and nothing is needed.
//
// With --no-audio there is no audio in the composition to probe, so the
// length collapses to "where the last lyric ends". The .lrc records only when
// a line BEGINS, so that end is an ESTIMATE from the next line, and a song
// whose final lyric is a minute before the last note gets a video a minute
// short. Measured: Kali Kali is 6:49.1 of audio, its last lyric ends at
// 5:47.5, and the render was 5:49.5 -- the overlay stopped while the song
// was still playing.
//
// --length fixes it, and --no-audio without it now says so rather than
// quietly producing a short file.
const LENGTH = numFlag("--length");   // numFlag, gotcha 28
const explicitSeconds = Number.isFinite(LENGTH) && LENGTH > 0 ? LENGTH : 0;

const pad = (s, n) => String(s).padEnd(n);
const rpad = (s, n) => String(s).padStart(n);
const rule = (label) => console.log("\n-- " + label + " " + "-".repeat(Math.max(0, 52 - label.length)));

// -- helpers ---------------------------------------------------------------
function legacyFamilyGuess(file) {
  // AMS TTFs are named ams.<name>.ttf; family names are Title Case per word.
  const base = path.basename(file).replace(/\.(ttf|otf)$/i, "");
  const m = base.match(/^ams[._](.+)$/i);
  const raw = m ? m[1] : base;
  const parts = raw
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((w) => (w.length > 1 ? w[0].toUpperCase() + w.slice(1) : w.toUpperCase()));
  const name = parts.join(" ");
  // ams.manthan.ttf -> "AMS Manthan" (the family inside the font's name
  // table; the CSS name must match it exactly or Chromium falls back again).
  return /^ams$/i.test(m ? m[1].split(/[\s._-]+/)[0] : "")
    ? name
    : "AMS " + name;
}

// Find a working Python interpreter, or null if there is none.
//
// The transcoder (scripts/lrc_legacy.py) is Python and is not optional for
// --legacy-font. Probing for the interpreter up front turns a confusing ENOENT
// thrown from deep inside execFileSync into a plain sentence about Python.
//
// `py` is checked too: on Windows a common install has the launcher but no
// `python` shim on PATH, and this is the single most likely reason a correct
// machine still fails here.
function pythonCommand() {
  const candidates =
    process.platform === "win32"
      ? [["python", ["-c", "pass"]], ["py", ["-c", "pass"]], ["python3", ["-c", "pass"]]]
      : [["python3", ["-c", "pass"]], ["python", ["-c", "pass"]]];
  for (const [cmd, args] of candidates) {
    try {
      execFileSync(cmd, args, { stdio: "ignore", windowsHide: true });
      return { cmd };
    } catch {
      // not this one; try the next
    }
  }
  return null;
}

/**
 * The font gate: prove, BEFORE any render work, that the chosen font can
 * actually write this song. Two shipped videos make this non-optional:
 *
 *   - a legacy layout that cannot encode the lyrics changes WORDS mid-render
 *     (फर्केर -> फरकर via the dropped virama) while every output check passes,
 *     because they all look at the container and none look at the text;
 *   - a legacy .ttf handed to --font-file (or a Unicode face missing glyphs)
 *     falls back per character to a different typeface -- the "wrong fonts"
 *     report with no error anywhere.
 *
 * scripts/font_gate.py runs the font repo's check_song.py for legacy paths and
 * a fontTools cmap-coverage check for Unicode ones. Returns true when the gate
 * passed or could not run for a benign reason (no Python) -- a missing tool
 * warns rather than blocking every render; a FAILED gate always blocks.
 */
function runFontGate(lrcPath, gateArgs) {
  if (SKIP_FONT_GATE) {
    console.warn(
      "  note: --skip-font-gate -- nothing has proven this font can write\n" +
      "        this song. You are the gate now: inspect frames before shipping."
    );
    return true;
  }
  const py = pythonCommand();
  const script = path.join(HERE, "scripts", "font_gate.py");
  if (!py || !fs.existsSync(script)) {
    console.warn("  note: font gate skipped (needs Python and scripts/font_gate.py)");
    return true;
  }
  const res = spawnSync(py.cmd, [script, "--lrc", lrcPath, ...gateArgs], {
    stdio: "inherit",
    cwd: HERE,
  });
  return (res.status || 0) === 0;
}
/**
 * The width table for the font this render will use.
 *
 * WHAT THIS IS
 * ------------
 * The auto-fit has to know how wide a cue will be before it renders, or the
 * text is sized for a wrap that does not happen and the delivered video is
 * quietly 25-30% smaller than it needs to be. Three cheaper answers were tried
 * first and all three were wrong in ways that looked right:
 *
 *   0.55em per code point     a Preeti font is ~0.48em per code point, so every
 *                             legacy line was predicted to wrap when it does
 *                             not, and got shrunk for nothing
 *   mean of the font's        0.7153em for Nirmala UI. A pre-base matra is
 *     hmtx advances           reordered by the shaper into space its consonant
 *     (fontTools)             already owns, so the real cost is ~0.33em per
 *                             code point. This predicted three lines for a line
 *                             the browser draws on one
 *   mean over consonants      0.7480em, still averaging narrow spaces in with
 *     only                    wide consonants
 *
 * So the numbers are MEASURED, by rendering sample lines in the same browser
 * that will render the video and measuring the ink they leave. See
 * scripts/calibrate_width.mjs. The result is cached in scripts/width.json,
 * keyed by font and by whether a song's own lines were used in the fit.
 *
 * WHY THE SONG MATTERS
 * --------------------
 * A fit on synthetic micro-samples described the real Allare line to 0.6% and a
 * plain four-consonant run to 36% -- right for the one line that mattered and
 * wrong for the shape of most others, because short samples carry a full side
 * bearing. So `scripts/calibrate_width.mjs --lrc <song>` adds twelve of the
 * song's own lines and fits on those, and reports leave-one-out error. On
 * Allare that is 2.4% on the lines that wrap, with the browser agreeing about
 * whether every line wraps.
 *
 * Returns null when there is no table, and the component then falls back to its
 * per-class defaults. Said out loud rather than silently, because a silent
 * fallback is how the original 0.55 shipped.
 */
function widthTableFor(fontFamily, lrcPath) {
  const cachePath = path.join(HERE, "scripts", "width.json");
  let cache = {};
  try {
    cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  } catch {
    return { table: null, note: "scripts/width.json is missing" };
  }
  // The overlay's CSS stack, in the order it is asked. Whichever of these is
  // installed FIRST is the face that will actually be drawn, so that is the one
  // the calibration has to be for. With no --font and no --font-file the stack
  // starts at "Noto Sans Devanagari", and looking that up first rather than
  // defaulting straight to Nirmala is the difference between measuring the right
  // face and confidently measuring the wrong one.
  //
  // A named family is used ALONE, never as a hint to search the stack. A
  // --font-file face is registered under its own name and is the one that will
  // be drawn, so falling back to "Nirmala UI +song" -- which existed in the
  // cache -- would measure a different font and fit the wrong widths for it.
  // A wrong-but-close number is the failure mode this whole table exists to
  // remove, so a miss is reported rather than papered over.
  const stack = fontFamily
    ? [fontFamily]
    : ["Noto Sans Devanagari", "Nirmala UI", "Microsoft New Tai Lue", "Segoe UI"];

  const candidates = [];
  for (const fam of stack) {
    // A fit on this song's own lines is preferred over a per-font one: it
    // describes the distribution the model is actually used on.
    candidates.push(fam + " +song", fam);
  }
  for (const k of candidates) {
    if (cache[k]) {
      return {
        table: cache[k],
        key: k,
        song: k.endsWith(" +song"),
        family: k.replace(" +song", ""),
      };
    }
  }
  const anyKey = Object.keys(cache)[0];
  if (anyKey) {
    return {
      table: null,
      note:
        "no entry for " + stack.join(" / ") + "; the closest is " + anyKey +
        ". Run: node scripts/calibrate_width.mjs --font \"" + stack[0] +
        "\" --lrc <song.lrc>",
    };
  }
  return {
    table: null,
    note:
      "scripts/width.json is empty. Run: node scripts/calibrate_width.mjs " +
      "--font \"" + stack[0] + "\" --lrc <song.lrc>",
  };
}
function resolveLegacyFont(fileOrPath, lrcPath) {
  // Accept an absolute path, a path relative to the song folder (where the
  // 01 Fonts collection lives one level up), or a bare file name there.
  const candidates = [
    fileOrPath,
    path.join(path.dirname(lrcPath), fileOrPath),
    path.join(path.dirname(lrcPath), "..", "01 Fonts", fileOrPath),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return path.resolve(c);
  }
  console.error("  Legacy font not found: " + fileOrPath);
  console.error("  Looked in: " + candidates.join("\n             "));
  process.exit(1);
}
/**
 * @param seconds explicit duration. See AUDIO_SECONDS below for why a
 *   --no-audio render has to carry one.
 */
/**
 * Find the sibling font repo, which is where layouts and .ttf files live now.
 *
 * Tries the parent of this repo first (the usual side-by-side clone), then a
 * couple of conventional spots under the user's home. Returns a path that may
 * not exist -- the caller reports it with the full path, which is more use than
 * a bare null.
 */
// (the repo lookup itself moved to scripts/font_ref.mjs -- see findFontsRepo)

/**
 * Consult the font repo's verdicts before rendering with a named font.
 *
 * The font GATE asks "can this layout write this song" and answers in seconds.
 * This asks "has anyone watched this font render a song" -- a different question,
 * and the one that decides whether the audience sees the right letters. Two
 * genuine Preeti fonts pass the gate and spell words wrong; five print raw
 * ASCII. Neither is detectable by asking whether the keys resolve.
 *
 * Policy, and it is a policy rather than a fact:
 *
 *   working    proceed
 *   untested   proceed with a loud warning, unless --strict-fonts (the default)
 *   broken     refuse. It is documented as spelling words wrong or printing
 *              ASCII; rendering it spends six minutes to reproduce a known fault.
 *   failed     refuse, same reasoning.
 *
 * Untested is not fatal even in strict mode, because the font repo's untested
 * state is where fonts being tested live, and a renderer that refuses them
 * cannot be used to find out whether they work. Strict mode refuses a
 * *deliverable* built on one; it does not block the experiment.
 */
function reportFontVerdict(slug) {
  if (!FONTS_REPO) return;
  let verdict;
  try {
    const r = checkFont(FONTS_REPO, slug, { strict: STRICT_FONTS });
    verdict = r.verdict;
    if (r.ok) {
      if (r.verdict.state === "working") return;   // nothing to say
      console.warn(
        "  warning: " + slug + " is UNTESTED in the font repo -- " +
        (FONT_RISK_TEXT.untested) + "."
      );
      console.warn(
        "           Rendering anyway because that is how a font gets tested. For a\n" +
        "           deliverable, pick one marked `working`:  py " +
        fontRepoScriptPath(FONTS_REPO, "check_verdicts.py") + " --report"
      );
      return;
    }
    console.error("");
    console.error("  refusing to render with " + slug + ": the font repo records it as " +
      verdict.state.toUpperCase() + ".");
    if (verdict.reason) console.error("    reason: " + verdict.reason);
    if (verdict.note) console.error("    " + verdict.note);
    console.error("");
    console.error("  The four states, and what they mean:");
    console.error("    working   rendered a full song and passed a human eye-check");
    console.error("    untested  no evidence either way -- NOT a pass");
    console.error("    broken    tested and rejected");
    console.error("    failed    cannot write real songs at all");
    console.error("");
    if (!verdict.knownBad) {
      console.error("  To render with an untested font on purpose:");
      console.error("      add --no-strict-fonts");
      console.error("");
    }
    console.error("  Every font, with its verdict:  py " +
      fontRepoScriptPath(FONTS_REPO, "check_verdicts.py") + " --report");
    console.error("");
    process.exit(1);
  } catch (err) {
    // An unreadable verdicts file is a stop, not a pass. The tempting failure
    // is to warn and render, because the font might well be fine -- and that is
    // precisely how a font nobody checked reaches a delivered video.
    console.error("");
    console.error("  could not read the font repo's verdicts: " + err.message);
    console.error("  Refusing rather than rendering unchecked. Fix it with:");
    console.error("      py " + fontRepoScriptPath(FONTS_REPO, "check_verdicts.py"));
    console.error("");
    process.exit(1);
  }
}

/**
 * Resolve --font-slug to a .ttf plus its generated layout, from the font repo.
 *
 * The slug names a directory in the font repo's fonts/ tree. Its layout is
 * layouts/<slug>.json. Both must exist: a .ttf with no layout means falling
 * back to Preeti, which renders that font's words wrong rather than erroring,
 * so a missing layout is treated as a hard failure.
 *
 * Returns null and prints why, or the object {ttf, layout, family}.
 */
function resolveFontSlug(slug) {
  const root = FONTS_REPO;
  const layout = path.join(root, "layouts", slug + ".json");
  const fontsDir = path.join(root, "fonts", slug);

  console.log("\n-- font slug " + slug + " " + "-".repeat(Math.max(0, 40 - slug.length)));
  if (!fs.existsSync(path.join(root, "layouts"))) {
    console.error("  No font repo at " + root);
    console.error("  Expected a layouts/ directory there. Clone it, or point at it:");
    console.error("      git clone https://github.com/mhzsajan/nepali-legacy-fonts");
    console.error("      node render.mjs ... --font-slug " + slug + " --fonts-repo <path>");
    process.exitCode = 1;
    return null;
  }
  if (!fs.existsSync(layout)) {
    console.error("  No layout for '" + slug + "' in the font repo.");
    console.error("  Looked for: " + layout);
    console.error("  The font repo ships 79 generated layouts; list them with:");
    console.error("      dir layouts\\*.json");
    console.error("  Or check the font can write your song at all before rendering:");
    console.error("      py ..\\nepali-legacy-fonts\\scripts\\check_song.py --font " + slug + " song.lrc");
    process.exitCode = 1;
    return null;
  }
  if (!fs.existsSync(fontsDir)) {
    console.error("  Layout '" + slug + "' exists, but no font files at:");
    console.error("      " + fontsDir);
    console.error("  Fetch the fonts first:  py scripts\\fetch_fonts.py");
    process.exitCode = 1;
    return null;
  }
  const ttf = fs.readdirSync(fontsDir)
    .filter((f) => /\.(ttf|otf)$/i.test(f))
    .sort()[0];
  if (!ttf) {
    console.error("  No .ttf or .otf in " + fontsDir);
    process.exitCode = 1;
    return null;
  }

  const file = path.join(fontsDir, ttf);
  // The family comes from the font file, not the slug: slugs are lowercase
  // ("ams-manthan") and the family is not ("Ams Manthan"), and a name that does
  // not resolve does not error -- the browser falls through to the system font
  // and the render looks like the flag was ignored.
  const family = flag("--font") || readFontFamily(file) || slug;
  console.log("  font slug   : " + slug);
  console.log("  font repo   : " + root);
  console.log("  layout      : " + path.relative(root, layout));
  return { ttf: file, layout, family };
}

/**
 * Read a .ttf's family name, so --font-file does not have to be told.
 *
 * The name is taken from the font rather than from --font because the two
 * disagree more often than not -- "Yantramanav" in the file, "Yantra Manav" in
 * a README, "Halant" in one place and "Halant New" in another -- and a mismatch
 * does not error. The CSS family simply does not resolve, the browser falls
 * through to the system font, and the render looks like the flag was ignored.
 */
function readFontFamily(file) {
  const py = pythonCommand();
  if (!py) return null;
  const script = path.join(HERE, "scripts", "font_family.py");
  if (!fs.existsSync(script)) return null;
  try {
    const out = execFileSync(py.cmd, [script, file], {
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const name = String(out).trim();
    return name && name.length < 80 ? name : null;
  } catch {
    return null;
  }
}

/**
 * Guarantee `src/calib-samples.generated.js` exists before anything bundles.
 *
 * GOTCHA 27 -- A GITIGNORED FILE AT THE TOP OF THE IMPORT GRAPH BREAKS EVERY
 * RENDER ON A FRESH CLONE. `src/WidthCalib.jsx` imports
 * `calib-samples.generated.js` at module level, because the calibration must
 * render sample lines as bare text (see WidthCalib's header). That module is
 * generated by `scripts/calibrate_width.mjs` and is in .gitignore -- so the
 * first render after `git clone` dies in webpack with a list of
 * "doesn't exist" aliases for .jsx/.mjs/.cjs/directory, i.e. four error lines
 * whose common cause is not one of them. On a machine that has run a
 * calibration it never happens, which is why it survived: the file was always
 * there.
 *
 * The fix writes a DEFAULT rather than un-ignoring the file, because the file
 * genuinely is derived data (a calibration replaces it), and because the
 * default has to come from the same source the calibration writes it from --
 * `SAMPLES` in src/width-model.mjs. Hard-coding a list here would be a second
 * copy that drifts, which is the vendored-copy mistake in a new dress.
 *
 * CALIB_MODEL null = no fitted table, so WidthCalib uses the per-class
 * DEFAULTS. That is the correct state for "nobody has calibrated this font
 * yet", and it is exactly what a still from WidthCalib would want anyway.
 */
async function ensureCalibSamples() {
  const target = path.join(HERE, "src", "calib-samples.generated.js");
  if (fs.existsSync(target)) return;
  const { SAMPLES } = await import(
    "file://" + path.join(HERE, "src", "width-model.mjs").replace(/\\/g, "/")
  );
  fs.writeFileSync(
    target,
    "// GENERATED by render.mjs as a default -- replaced by\n" +
    "// scripts/calibrate_width.mjs. See the comment on ensureCalibSamples()\n" +
    "// in render.mjs for why this file has to exist before the bundle is built.\n" +
    "export const CALIB_MODEL = null;\n\n" +
    "export const CALIB_SAMPLES = " + JSON.stringify(SAMPLES, null, 2) + ";\n",
    "utf-8"
  );
  console.log("  calib samples: wrote a default src/calib-samples.generated.js");
}

// GOTCHA 31 -- THE ENDS FILE HAS TO TRAVEL INTO THE COMPOSITION, NOT JUST INTO
// THE REPORT.
//
// writeGenerated() used to pass only LRC_TEXT through to lyrics.generated.js,
// and Root.jsx parsed that alone: parseLrc(LRC_TEXT). render.mjs had read the
// .ends.txt, matched 109/109 cues, printed "timed from Allare Remotion.ends.txt
// (100%)" -- and none of it reached the video. The composition fell back to the
// estimated end (the next line's start) for every cue, so every line stayed on
// screen until the FOLLOWING line arrived instead of stopping when the singer
// stopped. On Allare that is 0.28s to 2.6s of lingering per line, on 11 of the
// first 12 cues.
//
// The report was not lying about render.mjs's parse. It was reporting a
// different parse than the one the render used, and nothing compared them --
// the same shape as gotcha 25 (a calibration measuring a font the render never
// loaded) and gotcha 14 (a length the composition never saw). So the fix is not
// "pass the file over": it is that BOTH parses now come from one string, and
// scripts/check_ends_wire.mjs asserts the composition's cues equal render.mjs's.
function writeGenerated(lrcText, audioFile, legacy = null, seconds = 0, fontFile = null, fontFamilyName = null, endsText = null) {
  const esc = (s) =>
    s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
  const body =
    "// GENERATED by render.mjs -- do not edit.\n\n" +
    "export const LRC_TEXT = `" + esc(lrcText) + "`;\n\n" +
    "// The .ends.txt companion, verbatim (empty when there is none). This is the\n" +
    "// ONLY channel by which the tapped end times reach the composition, and\n" +
    "// Root.jsx must parse LRC_TEXT with it or every cue silently reverts to an\n" +
    "// estimated end. See gotcha 31.\n" +
    "export const ENDS_TEXT = `" + esc(endsText || "") + "`;\n\n" +
    "export const AUDIO_FILE = " + JSON.stringify(audioFile || "") + ";\n\n" +
    "// Non-empty when rendering with a legacy Preeti-era font: the family to\n" +
    "// register via FontFace and the .ttf file name inside public/fonts/.\n" +
    "export const LEGACY_FONT_FILE = " + JSON.stringify(legacy ? legacy.file : "") + ";\n" +
    "export const LEGACY_FONT_FAMILY = " + JSON.stringify(legacy ? legacy.family : "") + ";\n" +
    "\n// Non-empty for --font-file: a local .ttf registered under a name of our\n" +
    "// choosing, with the lyrics UNCHANGED. This is how a distinctive\n" +
    "// Devanagari face is used without a key layout, and therefore without the\n" +
    "// risk of one. See the FONT_FILE block in LyricOverlay.jsx.\n" +
    "export const FONT_FILE = " + JSON.stringify(fontFile || "") + ";\n" +
    "export const FONT_FAMILY_NAME = " + JSON.stringify(fontFamilyName || "") + ";\n" +
    "\n// Explicit duration in seconds, when render.mjs could not let the\n" +
    "// composition probe the audio. See AUDIO_SECONDS in render.mjs.\n" +
    "export const AUDIO_SECONDS = " + (Number(seconds) || 0) + ";\n";
  fs.writeFileSync(GENERATED, body, "utf-8");
}

function copyAudio(audioPath) {
  // Remotion resolves staticFile() from public/, so the audio must sit there.
  fs.mkdirSync(PUBLIC, { recursive: true });
  const dest = path.join(PUBLIC, path.basename(audioPath));
  if (fs.existsSync(dest)) fs.rmSync(dest);
  fs.copyFileSync(audioPath, dest);
  return dest;
}

function fmt(s) {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return m + ":" + r.toFixed(2).padStart(5, "0");
}

function report(cues, title) {
  console.log("\n  " + title);
  console.log("  " + cues.length + " cue(s)\n");
  cues.forEach((c, i) => {
    console.log(
      "  " + rpad(i + 1, 3) + "  " + rpad(fmt(c.time), 7) +
      "  " + rpad((c.end - c.time).toFixed(2) + "s", 7) + "  " + c.text
    );
  });
  if (cues.length) {
    let avg = 0;
    if (cues.length > 1) {
      const gaps = [];
      for (let i = 1; i < cues.length; i++) gaps.push(cues[i].time - cues[i - 1].time);
      avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    }
    console.log(
      "\n  last cue ends " + fmt(cues[cues.length - 1].end) +
      (avg ? "   |   avg gap " + avg.toFixed(2) + "s" : "")
    );
  }
  console.log("");
}

// -- one render ------------------------------------------------------------
async function run(audioPath, lrcPath) {
  if (LEGACY_FONT && FONT_FILE_ARG) {
    refuseBothFonts();
    return;
  }

  // --font-slug expands to a real --legacy-font plus a layout file, before
  // anything else reads those two. Done here rather than at each use site so
  // there is one place that knows the slug form exists.
  // Before ANY bundling: the calibration sample module is imported at module
  // level by src/WidthCalib.jsx, so its absence is a webpack error on every
  // fresh clone (gotcha 27).
  await ensureCalibSamples();

  const slug = FONT_SLUG ? resolveFontSlug(FONT_SLUG) : null;
  if (FONT_SLUG && !slug) return;

  // Which composition renders: the keyable overlay, or the full-frame styled
  // picture. One variable, used by both the render spawn and the --prepare-only
  // still hint, so the hint can never name a composition this render is not
  // using (a still from the wrong composition is a check of the wrong video).
  const COMP = STYLED ? "LyricStyled" : "LyricOverlay";

  const title = path.basename(audioPath).replace(/\.[^.]+$/, "");
  rule(title);

  const lrcText = fs.readFileSync(lrcPath, "utf-8");

  // --legacy-font: convert Unicode lyrics to the Preeti-era font's key
  // sequences so the classic font actually renders (see scripts/lrc_legacy.py).
  let legacy = null;
  let renderLrc = lrcText;
  if (slug || LEGACY_FONT) {
    const fontArg = slug ? slug.ttf : LEGACY_FONT;
    const family = flag("--font") || (slug ? slug.family : legacyFamilyGuess(LEGACY_FONT));
    const fontPath = slug ? slug.ttf : resolveLegacyFont(LEGACY_FONT, lrcPath);
    const convOut = path.join(HERE, "out", "_legacy-" + path.basename(lrcPath));
    fs.mkdirSync(path.dirname(convOut), { recursive: true });
    console.log("  legacy font : " + path.basename(fontPath) + " (" + family + ")");

    // Preflight: the transcoder is Python, and without it the Nepali text
    // cannot be encoded at all. Check BEFORE doing any work so the failure is
    // a sentence about Python rather than a raw ENOENT stack trace. The command
    // is literally "python" -- a Windows box that only has the "py" launcher
    // fails here too, so the hint mentions both.
    const py = pythonCommand();
    if (!py) {
      console.error("");
      console.error("  --legacy-font needs Python, and it was not found on PATH.");
      console.error("");
      console.error("  These 1990s-era Nepali fonts map ASCII keys, not Unicode, so the");
      console.error("  lyrics must be transcoded before Chromium can render them. That is");
      console.error("  what the font repo's scripts/lrc_legacy.py does.");
      console.error("");
      console.error("  Fix:  install Python 3, and make sure one of `python`, `py` or");
      console.error("        `python3` runs in this shell (all three are tried, in that");
      console.error("        order, so the `py` launcher alone is fine).");
      console.error("  Check with:  python --version   (or  py --version)");
      console.error("");
      console.error("  To render without it, drop --legacy-font and use a Unicode Devanagari");
      console.error("  font instead -- a Unicode face needs no conversion at all. Every font");
      console.error("  and its verdict:  py <fonts-repo>\\scripts\\check_verdicts.py --report");
      console.error("");
      process.exit(1);
    }

    // A slug carries its own layout. Falling back to the built-in --layout here
    // would feed a Preeti-era map to a font that does not speak Preeti, which
    // renders collapsed glyphs and a literal `==` where the danda should be.
    const layoutFile = slug ? slug.layout : LEGACY_LAYOUT_FILE;

    // The font gate runs BEFORE the transcode and long before the render: a
    // song the layout cannot write should fail in seconds with the affected
    // words named, not after a four-minute encode with wrong letters baked in.
    //
    // It used to run ONLY when a layout file existed, which meant it was skipped
    // for exactly the fonts that need it most. A PREETI font has no layout file
    // by definition -- it speaks the built-in Preeti map -- so `--legacy-font
    // foo.ttf` with no `--layout-file` printed a warning and rendered unchecked.
    // That is the class where a word silently comes out in two typefaces, and it
    // is 77 of the 214 fonts.
    //
    // So the fallback layout is now GATED rather than merely warned about, and
    // --also-emitted-keys adds the second half: the shared Preeti layout says
    // nothing about whether THIS font carries every key the encoder emits.
    const gateLayout = slug ? null : (layoutFile || LEGACY_LAYOUT);
    if (slug || gateLayout) {
      const gateArgs = slug
        ? ["--slug", FONT_SLUG, "--fonts-repo", FONTS_REPO]
        : ["--layout", gateLayout, "--font-file", LEGACY_FONT, "--also-emitted-keys"];
      if (!runFontGate(lrcPath, gateArgs)) {
        process.exitCode = 1;
        return;
      }
      // The gate proves the LAYOUT can write this song. It cannot say the font
      // draws the right glyphs -- that is the whole reason verdicts.json exists
      // and the whole reason this check is not redundant with the gate above.
      if (slug) reportFontVerdict(slug);
    } else {
      console.warn(
        "  note: --legacy-font with no layout -- the font gate could not run. If this\n" +
        "        font is not Preeti-layout the words render wrong with no\n" +
        "        error. Prefer --font-slug: the font repo resolves the layout\n" +
        "        AND gates the song."
      );
    }

    // The encoder lives in the FONT repo, not here. It maps Unicode to a font's
    // own key layout, and the layout data it reads has always lived there --
    // keeping the only copy of it in the renderer meant that the one place to
    // look when a font rendered wrong was somewhere nobody would think to look.
    // (scripts/font_ref.mjs is the whole interface between the two repos.)
    if (!FONTS_REPO || !fs.existsSync(path.join(FONTS_REPO, "scripts", "lrc_legacy.py"))) {
      console.error("");
      console.error("  A legacy font needs the font repository, which is not here.");
      console.error(FONTS_REPO_HELP);
      console.error("");
      process.exit(1);
    }
    try {
      fontRepoScript(FONTS_REPO, "lrc_legacy.py", [
        lrcPath, convOut,
        "--layout", LEGACY_LAYOUT,
        ...(layoutFile ? ["--layout-file", layoutFile] : []),
        "--font-family", family,
        "--font-file", path.basename(fontPath),
      ]);
    } catch (err) {
      // Surface the real cause. lrc_legacy.py prints "not round-trip exact"
      // warnings to stderr and exits non-zero if it cannot finish, and those
      // warnings are the actual diagnostic -- do not swallow them behind a
      // generic message.
      console.error("");
      console.error("  the font repo's lrc_legacy.py failed (exit " + (err.status ?? "?") + ").");
      console.error("  Any 'not round-trip exact' lines above name the word that failed");
      console.error("  to encode cleanly -- the font may not be Preeti-layout.");
      console.error("  Check which fonts are Preeti, and which are known broken:");
      console.error("      py " + fontRepoScriptPath(FONTS_REPO, "check_verdicts.py") + " --report");
      console.error("");
      process.exit(1);
    }
    // Strip audit/metadata lines: the component gets font info via the
    // generated module, not the LRC text.
    renderLrc = fs
      .readFileSync(convOut, "utf-8")
      .split(/\r?\n/)
      .filter((l) => !/^\[(raw|ti-font|ti-fontfile):/i.test(l))
      .join("\n");
    fs.mkdirSync(path.join(PUBLIC, "fonts"), { recursive: true });
    fs.copyFileSync(fontPath, path.join(PUBLIC, "fonts", path.basename(fontPath)));
    legacy = { family, file: path.basename(fontPath) };
  }

  // --font-file: a local .ttf used AS IS, with the lyrics unchanged.
  //
  // This is how a distinctive Devanagari face gets used without a key layout,
  // and therefore without the risk of one. It is NOT a legacy font: nothing is
  // transcoded, so there is no layout that can render the wrong letters, and
  // there is no round-trip to come out wrong. The 58 Unicode Devanagari fonts
  // in nepali-legacy-fonts -- many of them display faces -- are all reachable
  // this way.
  //
  // It has to be a separate flag rather than a variant of --legacy-font,
  // because --legacy-font also implies "convert the text to Preeti keys", and
  // running that on a Unicode font produces keys the font has no glyphs for:
  // silently, and with a video that looks fine.
  let fontFile = null;
  let fontFamilyName = null;
  // FONT_FILE_ARG was validated against --legacy-font at the top of this file,
  // before either was resolved, so the `if (legacy)` check that used to be here
  // is gone: it could only fire after the legacy path had already succeeded.
  if (FONT_FILE_ARG) {
    const found = [FONT_FILE_ARG, path.join(path.dirname(lrcPath), FONT_FILE_ARG),
      path.join(path.dirname(lrcPath), "..", "01 Fonts", FONT_FILE_ARG),
    ].find((p) => fs.existsSync(p));
    if (!found) {
      console.error("  Font file not found: " + FONT_FILE_ARG);
      console.error("  Looked in: " + FONT_FILE_ARG + ", beside the .lrc, and ../01 Fonts");
      process.exitCode = 1;
      return;
    }
    // Gate BEFORE copying/registering: a .ttf that cannot write this song --
    // including a legacy ASCII-mapped file handed to --font-file by mistake --
    // must fail here, in seconds, naming the missing characters.
    if (!runFontGate(lrcPath, ["--font-file", found])) {
      process.exitCode = 1;
      return;
    }
    // The family name is read out of the font itself rather than taken from
    // --font, because the two disagree more often than not ("Yantramanav" in
    // the file, "Yantra Manav" in a README) and a mismatch means the CSS
    // silently falls through to the system font.
    const familyName =
      flag("--font") || readFontFamily(found) || path.basename(found, ".ttf");
    fontFile = path.basename(found);
    fontFamilyName = familyName;
    fs.mkdirSync(path.join(PUBLIC, "fonts"), { recursive: true });
    fs.copyFileSync(found, path.join(PUBLIC, "fonts", fontFile));
    console.log("  font file : " + found);
    console.log("  family    : " + JSON.stringify(familyName) + "  (from the font, not a flag)");
  }

  // Imported dynamically so the exact same parser the component uses is the
  // one producing this report -- no second copy to drift.
  const { parseLrc } = await import(
    "file://" + path.join(HERE, "src", "parse-lrc.mjs").replace(/\\/g, "/")
  );
  // Song Timer's "For Remotion AI" export writes the end timings in a
  // companion file beside the .lrc. It cannot go in the .lrc itself: AbleSet
  // turns every timestamp into a MIDI clip, so a second stamp would show the
  // lyric twice in Ableton.
  //
  // It is named per target now -- Song.remotion_start.lrc beside
  // Song.remotion_end.lrc -- because the AbleSet export is ALSO called
  // Song.lrc, and two files with one name and different content is how the
  // wrong one gets dragged into Ableton.
  //
  // Found by name, in order of preference: an explicit --ends, then the
  // current Song.remotion_end.lrc, then the old Song.ends.txt. Folders
  // exported before the rename must keep rendering, so neither convention is
  // dropped.
  //
  // The "_start" has to come OFF the base before "_end" goes on. Deriving the
  // end name by appending alone gave Song.remotion_start.remotion_end.lrc,
  // which is not the name Song Timer writes -- so the lookup missed, the render
  // fell back to estimating every end, and it exited 0. That is the exact
  // failure the ends file exists to prevent, reintroduced by the rename.
  //
  // A separator is required before "start" so a song genuinely called
  // "Restart" is not rewritten to "Re.remotion_end.lrc".
  //
  // Reading is done HERE, not in parse-ends.mjs, because that module is
  // bundled for the browser and cannot use "fs".
  // How many `m:ss.ss | m:ss.ss | text` rows a candidate ends file has. Used
  // only to CHOOSE between two files -- parseLrc does the real parsing. It is
  // deliberately a count and not a parse: the question is "does this file look
  // like ends at all", and reusing the real parser would mean trusting the thing
  // being chosen between.
  const endsPath_probe = (text) => {
    const row = /^\s*\d+:\d+(?:[.:]\d+)?\s*\|\s*\d+:\d+(?:[.:]\d+)?\s*\|/;
    let n = 0;
    for (const line of String(text).split(/\r?\n/)) if (row.test(line)) n++;
    return n;
  };
  const endsRowCount = endsPath_probe;

  const lrcBase = lrcPath.replace(/\.lrc$/i, "");
  const pairBase = lrcBase.replace(/[._-](?:remotion_)?start$/i, "");
  const endsCandidates = flag("--ends")
    ? [flag("--ends")]
    : [
        // ".ends.txt" FIRST. It is the format the renderer parses, and the one
        // the pipeline itself writes.
        //
        // The order was the wrong way round, and the symptom was a long way from
        // the cause: a folder holding both always used the Song Timer export --
        // a different format -- so the correct file was never opened. On Kali
        // Kali that meant 1 of 48 ends applied and the render was refused as
        // "stale". parseLrc was never at fault: fed the right file it reported
        // 48/48 timed.
        pairBase + ".ends.txt",
        pairBase + ".remotion_end.lrc",
      ];
  // Prefer a candidate that PARSES over one that merely exists. Existence is not
  // fitness, and having two candidates is only useful if we try the one that
  // works before settling for the one that is merely there.
  const readable = endsCandidates.filter((p) => fs.existsSync(p));
  const endsPath =
    readable.find((p) => {
      try {
        return endsRowCount(fs.readFileSync(p, "utf-8")) > 0;
      } catch {
        return false;
      }
    }) || readable[0] || endsCandidates[0];
  const endsFound = readable.length > 0;
  // If the .lrc is clearly one half of a pair and no half was found, say so by
  // name. "none found" alone is indistinguishable from never having tapped
  // ends, and the two need different fixes.
  const looksPaired = pairBase !== lrcBase;
  let endsText = null;
  if (fs.existsSync(endsPath)) {
    try {
      endsText = fs.readFileSync(endsPath, "utf-8");
    } catch (err) {
      console.error("  Could not read " + endsPath + ": " + err.message);
    }
  }
  const parsed = parseLrc(renderLrc, endsText);
  // The report is generated from the parse result, so it is the single source
  // of truth for what was applied.
  const endsFile = {
    loaded: parsed.hasEnds || endsText != null,
    problems: endsText == null ? [] : (await import(
      "file://" + path.join(HERE, "src", "parse-ends.mjs").replace(/\\/g, "/")
    )).parseEnds(endsText).problems,
  };

  if (!parsed.cues.length) {
    console.error("  No timed lines found in the .lrc -- nothing to render.");
    process.exitCode = 1;
    return;
  }

  report(parsed.cues, parsed.title || title);

  // Say where the ends came from. A video that silently mixes real and guessed
  // ends is impossible to trust, and this is the only place that shows it.
  // "timed-clamped" counts: it came from the tapped file, adjusted to the
  // next line's start because the singer's tail ran a fraction past it. Only
  // "estimated" means the tapping was thrown away entirely.
  const timed = parsed.cues.filter(
    (c) => c.endFrom === "timed" || c.endFrom === "timed-clamped"
  ).length;
  const clamped = parsed.cues.filter((c) => c.endFrom === "timed-clamped").length;
  if (endsFile.loaded) {
    const pct = Math.round((timed / parsed.cues.length) * 100);
    console.log("  ends       : " + timed + "/" + parsed.cues.length +
      " timed from " + path.basename(endsPath) + " (" + pct + "%)" +
      (clamped ? "  [" + clamped + " clamped to the next line's start]" : ""));
    if (endsFile.problems.length) {
      console.log("               " + endsFile.problems.length +
        " problem line(s) in that file, ignored:");
      for (const p of endsFile.problems.slice(0, 5)) console.log("                 " + p);
    }
    // An ends file that mostly cannot be applied is the signature of a
    // different take of the song. Rendering it anyway would quietly reproduce
    // the old estimate while looking as though the ends had been applied, so
    // it stops here and says why. --allow-stale-ends overrides.
    if (timed < parsed.cues.length && !has("--allow-stale-ends")) {
      console.error("");
      if (timed === 0) {
        console.error("  None of the ends in " + path.basename(endsPath) +
          " match this .lrc.");
      } else {
        console.error("  Only " + timed + " of " + parsed.cues.length +
          " ends could be applied; the rest were rejected as stale.");
      }
      console.error("  That usually means the .lrc and the ends file are from");
      console.error("  different sessions, or the lyrics were re-timed after the");
      console.error("  ends were recorded.");
      console.error("");
      console.error("  Re-export both from Song Timer, or pass --allow-stale-ends");
      console.error("  to render anyway using the estimates for the rest.");
      console.error("");
      process.exitCode = 1;
      return;
    }
  } else {
    // No ends file. Every cue is about to be given an ESTIMATED end -- the
    // next line's start -- which is exactly the lingering-lyric failure the
    // ends file exists to remove: a line sung before a long instrumental
    // stays on screen until whatever comes next, and the render still exits
    // 0 with a plausible-looking file whose timing is not the timing that
    // was tapped. That is gotcha 19's failure, and it survived a fix that
    // only made the report name the paths it looked for: the message prints
    // between the cue list and the render, scrolls past, and no script can
    // see it because the exit code stayed 0.
    //
    // So this is a hard stop. A fallback that quietly produces a wrong
    // deliverable is a failure, not a default -- and the fix is one flag,
    // which means the alternative is always available and never accidental.
    // --allow-missing-ends is the way to mean it.
    const explicitEnds = flag("--ends");
    const endsUnreadable = endsFound && endsText == null;
    console.error("");
    console.error("  ends       : NONE -- every line would be ESTIMATED from the next");
    console.error("               line's start instead of using your tapped ends.");
    if (explicitEnds) {
      // A path was named by hand and it is not there. That is a different
      // mistake from "no file was written", and it needs a different fix, so
      // it is not folded into the "looked for" list below.
      console.error("               --ends " + explicitEnds + " does not exist.");
    } else if (endsUnreadable) {
      console.error("               " + endsCandidates[0] + " is there but could not");
      console.error("               be read -- the error is above.");
    } else {
      // Name the exact paths: a wrong name is a rename away from working, and
      // "none found" gives no way to find it.
      console.error(
        "               looked for " +
          endsCandidates.map((p) => path.basename(p)).join(" and ") +
          " beside the .lrc -- neither is there"
      );
      if (looksPaired) {
        // The .lrc is named like one half of a pair, so an ends file was
        // expected and one of the two was probably renamed.
        console.error(
          "               (Song Timer 'For Remotion AI' writes both halves; " +
            "if you renamed one, rename the other to match)"
        );
      } else {
        console.error(
          "               (Song Timer 'For Remotion AI' writes one; put it beside the .lrc)"
        );
      }
    }
    console.error("");
    if (has("--allow-missing-ends")) {
      console.log("  ends       : none found, estimating from the next line" +
        " (--allow-missing-ends)");
    } else {
      console.error("  Re-export both halves from Song Timer, point --ends at the");
      console.error("  file, or pass --allow-missing-ends to render with the");
      console.error("  estimates anyway.");
      console.error("");
      process.exitCode = 1;
      return;
    }
  }

  // --check runs the preflight script and stops. At 25-30 songs this replaces
  // discovering a mistimed chorus after a four-minute render.
  if (has("--check")) {
    const checker = path.join(HERE, "scripts", "check_song.mjs");
    const code = spawnSync(process.execPath, [checker, lrcPath, endsPath], {
      stdio: "inherit",
      cwd: HERE,
    }).status;
    process.exitCode = code || 0;
    return;
  }

  const MODES = ["center", "roam", "horizontal", "vertical", "mix"];
  const MODE = flag("--mode") || "";
  if (MODE && !MODES.includes(MODE)) {
    console.error('  Unknown --mode "' + MODE + '". Use ' + MODES.join(", ") + ".");
    process.exitCode = 1;
    return;
  }

  // The mix options are validated HERE, before --report-only returns, so a bad
  // --mix-block is caught on the cheap dry run rather than after the encoding
  // step. Nothing here touches `props` or `seed`: both are declared further
  // down, and reading them from up here is a temporal dead zone error. The
  // values are carried in MIX and copied over where they exist.
  let MIX = null;
  if (MODE === "mix") {
    const block = numFlag("--mix-block") || 8;   // numFlag, gotcha 28
    if (block < 4) {
      // Not a clamp-without-telling: a presentation every four cues is already
      // at the edge of readable, and one cue per presentation is a flicker.
      console.error(
        "  --mix-block " + block + " is too small. The minimum is 4 cues per " +
          "presentation, because at Allare's median 1.4s a cue, anything less " +
          "is a flicker rather than variety."
      );
      process.exitCode = 1;
      return;
    }
    MIX = { block, spec: flag("--mix-plan") || "" };
  }
  if (REPORT_ONLY) return;

  // --prepare-only is handled further down, once the props exist. It has to be
  // down there: it prints a `remotion still` command that passes
  // --props=out/props.json, and the only way to honour that is to actually
  // write that file. It used to return here and then suggest a props file
  // nothing had ever written, so following the hint rendered a still with
  // DEFAULT props -- wrong font size, wrong position, no word animation -- and
  // it looked plausible, which is the whole problem with a font check.

  const style = flag("--style");
  if (style && !STYLES.includes(style)) {
    console.error('  Unknown style "' + style + '". Choose from: ' + STYLES.join(", "));
    process.exitCode = 1;
    return;
  }

  // --no-audio: the composition gets no <Audio> at all, so the overlay is a
  // pure text layer. --muted is passed anyway as belt-and-braces so no audio
  // stream can ever appear in the container.
  //
  // That also means the composition cannot probe the audio for its length, so
  // the length falls back to the last cue's estimated end. Warn loudly
  // rather than shipping a file that stops before the song does.
  if (NO_AUDIO && !explicitSeconds) {
    console.warn(
      "  note: --no-audio with no --length.\n" +
      "        The video will end where the last lyric ends, which is an\n" +
      "        ESTIMATE from the next line's start. If the song runs on\n" +
      "        after the final lyric, this file will be short.\n" +
      "        Pass --length <seconds> to set the real duration.\n"
    );
  }
  if (NO_AUDIO) {
    writeGenerated(renderLrc, "", legacy, explicitSeconds, fontFile, fontFamilyName, endsText);
  } else {
    const audioName = copyAudio(audioPath);
    writeGenerated(renderLrc, "/" + path.basename(audioName), legacy, explicitSeconds, fontFile, fontFamilyName, endsText);
  }

  const outDir = path.join(HERE, "out");
  fs.mkdirSync(outDir, { recursive: true });
  const defaultExt = PREVIEW ? ".mp4" : FORMAT === "mov" ? ".mov" : ".mp4";
  // A styled render never overwrites the overlay deliverable of the same song:
  // two different products, two different default names.
  const outPath =
    flag("--out") || path.join(outDir, title + (STYLED ? "-styled" : "") + defaultExt);

  // Style travels as composition PROPS, not environment variables. Remotion
  // statically replaces process.env.X at build time, and an unset variable
  // becomes the literal string "undefined" -- truthy, so
  // `process.env.LYRIC_COLOR || "#ffffff"` yields "undefined": an invalid CSS
  // colour that silently renders the text black. Number("undefined") is NaN, so
  // the font size collapses to the browser default as well.
  // FPS as a PROP (see Root.jsx): env vars get baked into the cached bundle
  // and a changed LYRIC_FPS was silently ignored on re-render.
  const fps = numFlag("--fps") || (PREVIEW ? 15 : FORMAT === "mov" ? 60 : 30);  // numFlag, gotcha 28
  const props = { fps };
  // Title cards. The window is derived from the song's own first/last lyric
  // (src/opener.js), so these are on/off switches rather than numbers to keep
  // in step with the timings by hand. The title and band come from the .lrc's
  // [ti:] and [ar:] and are parsed inside the component.
  if (has("--title-card")) props.titleCard = true;
  if (has("--title-card-outro")) {
    props.titleCard = true;
    props.titleCardOutro = true;
  }
  if (style) props.style = style;

  // --size-preset: the three sizes judged on Kali Kali, as one flag.
  //
  // These were chosen by rendering the SAME 130 seconds at three sizes and
  // looking at them, which is the only way this was ever going to be decided --
  // and the differences are not subtle, because --size is a floor rather than a
  // peak. The biggest word on screen is:
  //
  //     peak = base * (1 + size-var) * (1 + size-drift)
  //
  // so the original 150/0.20/0.18 reached 212px and filled ~90% of a 1080p frame,
  // which is too much for a layer that has to sit on top of live video. All three
  // rungs keep the per-word size variation; they differ only in how far it goes.
  //
  //   large   120 / 0.10 / 0.06   peak ~140px   ~62% of frame width
  //   medium  105 / 0.08 / 0.05   peak ~119px   ~53%    <- the house size
  //   small   90 / 0.06 / 0.04    peak ~99px    ~45%
  //
  // It is a PRESET, not an override: an explicit --size, --size-var or
  // --size-drift wins, so this can never quietly override a deliberate number.
  // Resolved here, before any of them are read, because props.fontSize is set
  // above the block that computes the variance.
  const SIZE_PRESETS = {
    small:  { size: 90,  sizeVar: 0.06, sizeDrift: 0.04 },
    medium: { size: 105, sizeVar: 0.08, sizeDrift: 0.05 },
    large:  { size: 120, sizeVar: 0.10, sizeDrift: 0.06 },
  };
  const sizePresetArg = flag("--size-preset");
  const SIZE_PRESET = sizePresetArg ? SIZE_PRESETS[sizePresetArg] : null;
  if (sizePresetArg && !SIZE_PRESET) {
    console.error('  Unknown --size-preset "' + sizePresetArg + '". Use one of: ' +
      Object.keys(SIZE_PRESETS).join(", ") + ".");
    process.exitCode = 1;
    return;
  }
  // --size is checked with `flag()` first so that an absent flag leaves the
  // component default alone, and `--size 0` is impossible (0 is not a size).
  // SIZE_PRESET supplies a default; an explicit --size always wins (see the
  // preset table above). `flag()` first, so an absent flag cannot zero the size.
  if (flag("--size") && numFlag("--size") > 0) props.fontSize = numFlag("--size");
  else if (SIZE_PRESET) props.fontSize = SIZE_PRESET.size;
  if (flag("--color")) props.color = flag("--color");
  if (flag("--position")) props.position = flag("--position");
  const seed = flag("--seed") || parsed.title || title;
  props.seed = seed;
  if (flag("--shadow")) props.shadow = flag("--shadow");
  // --mode = how a line is PLACED. Independent of --word-anim, which controls
  // how it is animated once placed.
  //   center     (default) lines stack in the middle, outgoing drifts up
  //   roam       each line gets its own seeded spot (reference-video look)
  //   horizontal one left-aligned band, lines stack down -- the karaoke look,
  //              where the eye follows one line instead of chasing a word that
  //              moves every line. Pair it with --word-anim karaoke.
  //   vertical   one centred narrow column, lines stack down
  //   mix        all of the above, planned across the song (--mix-block,
  //              --mix-plan). A presentation is a placement AND a unit, word
  //              or phrase, so --word-anim applies to the word blocks only.
  //
  // MODE was validated and MIX resolved before --report-only returned, so the
  // plan can be printed on the dry run. The values are copied into props HERE
  // because props does not exist up there.
  if (MODE) props.mode = MODE;
  if (MIX) {
    props.mixBlock = MIX.block;
    if (MIX.spec) props.mixPlanSpec = MIX.spec;
  }

  // --motion <off|calm|vivid|wild>
  //
  // A per-line choreography pool, dealt from a seeded deck so no two neighbouring
  // lines share a motion and every motion is used (src/motion.js). Off unless
  // asked for -- see the note in Root.jsx defaultProps: motion displaces text,
  // and a displacement is how this project has clipped a line before.
  //
  // An UNKNOWN level is an error, not a silent default. Every other unknown
  // string flag in this file falls back to something plausible, and the
  // result of that is a video nobody can explain; here a typo would mean
  // "you asked for motion and got none" with exit 0, which is the same shape
  // as the two-parse bug in gotcha 31.
  const motionArg = flag("--motion");
  if (motionArg) {
    if (!MOTION_LEVELS.includes(motionArg)) {
      console.error(
        '  Unknown --motion "' + motionArg + '". Use one of: ' +
        MOTION_LEVELS.join(", ") + "."
      );
      process.exitCode = 1;
      return;
    }
    props.motion = motionArg;
  }
  if (numFlag("--motion-block") > 0) props.motionBlock = numFlag("--motion-block");

  // --depth: the seven composition layers in src/depth.js. Separate from
  // --motion, which varies how a line ARRIVES; this changes how the words are
  // composed and relate to each other.
  //
  // Off by default, like --motion and --size-drift. Two reasons, and the second
  // is the important one: a composition layer nobody asked for is a look nobody
  // chose, and `sequence` deliberately DELAYS words until the previous one has
  // begun -- which is the effect people want and also the one that can put a
  // word on screen after its line has ended. It is fitted to each cue's own
  // span so that cannot happen, and check_depth.mjs asserts it, but a default
  // that changes timing is not a default.
  const depthArg = flag("--depth") || "off";
  if (!DEPTH_LEVELS.includes(depthArg)) {
    console.error('  Unknown --depth "' + depthArg + '". Use one of: ' +
      DEPTH_LEVELS.join(", ") + ".");
    process.exitCode = 1;
    return;
  }
  props.depth = depthArg;
  if (depthArg !== "off") {
    console.log("  depth   : " + depthArg +
      " (tracking, baseline drift, arc, coupled depth, sequenced reveal," +
      " chromatic, glow)");
  }

  // --word-fill: how much of each cue's span the words are laid across. The rest
  // is a HOLD before the next line -- the gap the reader needs, and the reason a
  // line does not start arriving as the previous one dies.
  //
  // Unlike every other default in this file this one is ON, because the failure it
  // prevents is a dropped word rather than a look nobody chose. Measured across all
  // seven songs with the words laid across the full span, 146 of 450 cues gave
  // their last word under 0.33s on screen and 118 gave it under 0.20s; the tightest
  // was one single frame. A word with one frame reads on screen as a typo.
  //
  // --word-fill 1 restores the old behaviour and is not an error: it is what you
  // want to compare against, and some lines legitimately want no hold.
  const wordFillArg = flag("--word-fill");
  if (wordFillArg != null) {
    const wf = Number(wordFillArg);
    if (!Number.isFinite(wf) || wf <= 0 || wf > 1) {
      console.error('  --word-fill must be a number greater than 0 and at most 1' +
                    ' (the fraction of each cue the words occupy). Got "' +
                    wordFillArg + '".');
      process.exitCode = 1;
      return;
    }
    props.wordFill = wf;
    console.log("  word fill: " + wf.toFixed(2) +
      " of each cue, " + (1 - wf).toFixed(2) + " held before the next line");
  } else {
    // Explicit null, so the composition resolves WORD_FILL itself. Passing the
    // number from here would be a second default in a second file, and the two
    // would drift the first time one of them changed.
    props.wordFill = null;
  }

  // --wrap: break a long line into ROWS at full size, instead of shrinking the
  // type until it fits on one row.
  //
  // On by default, and this is the second flag here that is. A 50-character Allare
  // line used to come out in type you could read across a room, because shrinking
  // was the only strategy available: the renderer picked whichever shape the
  // measurement allowed rather than the one the lyric wanted. Wrapping first and
  // shrinking only if the rows still overflow the frame keeps the house size and
  // lets a long line simply be taller.
  //
  // `off` restores the old behaviour. It is not an error: it is what you want to
  // compare against, and a single short line is unaffected either way.
  const wrapArg = flag("--wrap") || "rows";
  if (!["rows", "off"].includes(wrapArg)) {
    console.error('  Unknown --wrap "' + wrapArg + '". Use one of: rows, off.');
    process.exitCode = 1;
    return;
  }
  props.wrap = wrapArg;
  if (wrapArg === "rows") {
    console.log("  wrap   : rows -- a long line breaks into rows at full size, and only");
    console.log("           shrinks if those rows would overflow the frame");
  }

  // --x-pos: vary WHERE each line sits horizontally, per cue.
  //
  // The report was that the words sat on the left of the screen most of the time,
  // and that was true -- but not because of any bias in the placement table. Each
  // band has a fixed left, and --mix holds one placement for --mix-block
  // consecutive cues, so cues 0-7 were all `horizontal` and all left-aligned.
  //
  // The PLACEMENT stays in blocks, because changing the composition every cue
  // reads as a flicker. The POSITION within it varies per cue, which the eye
  // reads as variety rather than as motion. Measured on Allare: the left bias is
  // gone, and no line reaches the frame margin.
  if (has("--x-pos")) {
    props.xPos = true;
    console.log("  x pos  : per cue -- left / centre / right, seeded, margin-clamped");
  } else {
    props.xPos = false;
  }

  // --title-word: WHAT THE TITLE-WORD HIGHLIGHT MATCHES ON, and what to do when the
  // .lrc disagrees with the lyric.
  //
  // The feature reads the title from the .lrc's [ti:] tag, which is right when the
  // two agree and useless when they do not: a song whose title is recorded in
  // English, over a Nepali lyric, has a title word that appears nowhere in the
  // text -- and a matcher that finds nothing looks EXACTLY like a feature nobody
  // implemented. That is the failure this block exists to make impossible.
  //
  // So it is reported on every run, and it fails loudly:
  //   - the title it is using, and where that came from
  //   - how many cues actually contain one of its words
  //   - the exact flag to add when that count is zero
  // --title-word overrides the .lrc outright, comma separated for a two-word title.
  {
    const override = flag("--title-word") || "";
    // The [ti:] tag is read from the .lrc HERE rather than from props, because
    // props.title is not populated at this point in the run -- Root.jsx parses it
    // later, from lyrics.generated.js. Reading it from the same file the cues came
    // from is also the only way the report can be trusted: if this says the title is
    // missing, the composition will agree, and if it says the title is present but
    // matches nothing, that is a fact about the lyric rather than about plumbing.
    let lrcTitle = String(props.title || "").trim();
    if (!lrcTitle) {
      try {
        const raw = fs.readFileSync(lrcPath, "utf-8");
        const m = /\[ti:([^\]]*)\]/i.exec(raw);
        if (m) lrcTitle = m[1].trim();
      } catch { /* the report must not fail over a nicety */ }
    }
    const words = (override || lrcTitle)
      .split(",").map((s) => s.trim()).filter(Boolean);
    props.titleWords = words;
    const { titleWordFlags } = await import("./src/title.js");
    let cuesWith = 0;
    let hits = 0;
    // THE CUES COME FROM `parsed`, NOT FROM props.cues, and that is the whole
    // reason the first version of this block printed a WARNING on a song whose
    // lyric plainly contains the title word. props.cues is filled in by Root.jsx,
    // from lyrics.generated.js, at RENDER time -- so at report time it is an empty
    // array, the loop below iterated over nothing, and the report said "that title
    // word is in NO cue" about a line reading:
    //
    //     हो... मोहनीको बाटो जादै नजाने म परेँ अल्लारे
    //
    // which contains it. `parsed` is the same parse this script already ran for its
    // own cue report, twenty lines earlier in the same function, so it is populated
    // and it is the same data the composition will get.
    for (const c of (parsed.cues || [])) {
      const n = titleWordFlags(c.text, words).filter(Boolean).length;
      if (n) { cuesWith++; hits += n; }
    }
    const totalCues = (parsed.cues || []).length;
    console.log("  title  : " + (override
      ? "--title-word " + words.join(", ")
      : (lrcTitle || "(none found in the .lrc)")));
    if (!words.length) {
      console.log("           NO TITLE WORD -- the highlight is OFF. To turn it on:");
      console.log("             --title-word \"<the word as it appears in the lyric>\"");
    } else if (!cuesWith) {
      console.log("           WARNING: that title word is in NO cue. The highlight will");
      console.log("           never fire. The .lrc [ti:] tag and the lyric are probably");
      console.log("           in different scripts. Re-run with:");
      console.log("             --title-word \"<the word as it appears in the lyric>\"");
    } else {
      console.log("           fires on " + hits + " word(s) across " + cuesWith +
        " of " + totalCues + " cues");
    }
  }

  // --color-mode: per-word and per-letter COLOUR (src/color.js).
  //
  // Off by default, for the same reason --depth is: a colour nobody chose is a
  // look nobody chose, and white-on-black is what this deliverable IS -- it gets
  // blended Add/Screen over a camera feed, so a dark or heavily tinted word does
  // not show up on the footage at all. See the overlay note at the top of
  // src/color.js for why the ranges are bounded rather than full-spectrum.
  //
  // An UNKNOWN level is an error rather than a fallback to "off". Every other
  // unknown string flag in this file falls back to something plausible, and the
  // result is a file nobody can explain; here a typo would produce plain white
  // text with exit 0, which is exactly the shape of gotcha 31.
  const colorArg = flag("--color-mode") || "off";
  if (!COLOR_LEVELS.includes(colorArg)) {
    console.error('  Unknown --color-mode "' + colorArg + '". Use one of: ' +
      COLOR_LEVELS.join(", ") + ".");
    process.exitCode = 1;
    return;
  }
  props.colorMode = colorArg;
  // --color-scheme: WHICH colours go together. The level above says how MUCH
  // colour; this says what is allowed to sit next to what, which is the
  // difference between a palette and six unrelated hues. Default is analogous --
  // tonal and safe. `rainbow` reproduces the pre-scheme behaviour exactly, so a
  // look you have already seen is still reachable by name.
  const schemeArg = flag("--color-scheme") || "analogous";
  // `duo:<degrees>` is a legal scheme name and is NOT in COLOR_SCHEMES, because it
  // is an anchor plus an INTERVAL rather than one of the fixed tables. Validating
  // it here costs nothing and its absence cost a render: the palette was changed
  // to duo:25, `node --check` passed, the batch was launched, and every job died
  // at argument parsing with a bare "Unknown --color-scheme". The gate was right
  // and the feature was unreachable from the command line.
  const duoArg = /^duo:-?\d+(?:\.\d+)?$/.exec(schemeArg);
  if (!COLOR_SCHEMES.includes(schemeArg) && !duoArg) {
    console.error('  Unknown --color-scheme "' + schemeArg + '". Use one of: ' +
      COLOR_SCHEMES.join(", ") + ".");
    process.exitCode = 1;
    return;
  }
  props.colorScheme = schemeArg;
  // A phrase line is ONE block of text, so a gradient across it is one property
  // on the line element -- the cheapest colour effect here, and the one that
  // needs no span per letter at all.
  props.colorGradient = has("--color-gradient");
  // --color-accent: HOW OFTEN the accent colour is dealt at all, 0..1.
  //
  // At 1.0 a `duo` line deals red and white in equal measure, which is a
  // COLOURED SENTENCE with white in it -- a palette applied to a line, not an
  // accent inside one. Lower values make the accent the exception: at 0.2 roughly
  // one word in five is picked out and the rest stay white.
  //
  // Seeded per word, so a song accents the SAME words on every render and in both
  // of its versions. A version whose accent words moved would not be the same
  // song twice.
  const accentRaw = numFlag("--color-accent");
  props.colorAccent = Number.isFinite(accentRaw)
    ? Math.min(Math.max(accentRaw, 0), 1)
    : 1;
  if (colorArg !== "off" && props.colorAccent < 1) {
    console.log(
      "  accent   : " + (props.colorAccent * 100).toFixed(0) +
      "% of words take the accent colour, the rest stay white"
    );
  }
  // --color-hue: the palette's anchor, in degrees. Without it every word drifts
  // around 0deg, which is red and reads as an error rather than a palette. 210 is
  // a cool cyan-blue, which sits well over most footage; any degree is accepted.
  const hueRaw = numFlag("--color-hue");
  props.colorHue = Number.isFinite(hueRaw) ? ((hueRaw % 360) + 360) % 360 : 210;
  if (colorArg !== "off") {
    console.log("  colour  : " + colorArg + " per-word" +
      (colorArg === "calm" ? "" : " and per-letter") +
      ", anchored at " + props.colorHue + "deg");
  }

  // --loudest: every layer at once, in one flag.
  //
  // It exists because the alternative was nine flags typed by hand into five
  // commands, and that is how one of them ends up with a different --size-var and
  // produces a file that does not match its eight siblings with nothing to show
  // the difference. It is a SET OF DEFAULTS and nothing more: every single one of
  // them yields to an explicit flag, so `--loudest --size 90` is the full
  // treatment at a smaller size rather than a fight between two settings.
  //
  // --loudest is applied at the END of this function, not here. It was here
  // first, and it was silently overwritten: this block set props.sizeVar = 0.08,
  // and the size block further down -- which cannot tell "the flag was absent"
  // from "the flag asked for the default" -- reassigned 0.15 a hundred lines
  // later. The render looked plausible and was the wrong size, which is the
  // exact failure this repo keeps re-learning.
  //
  // The rule the move encodes: a preset fills in what nobody asked for, so it
  // has to be the LAST writer. See applyLoudest() near the end of this function.

  // --styled: the house style (styles/house.md) as DEFAULTS -- title cards on,
  // mix placement, karaoke words, letter pop at the 0.03 cap, size 128, white
  // halo. Every one yields to an explicit flag: these fill in what was not
  // asked for, they never override what was.
  if (STYLED) {
    if (!has("--title-card") && !has("--title-card-outro")) {
      props.titleCard = true;
      props.titleCardOutro = true;
    }
    if (!MODE) {
      props.mode = "mix";
      props.mixBlock = numFlag("--mix-block") > 0 ? numFlag("--mix-block") : 8;
    }
    if (!flag("--word-anim")) props.wordAnim = "karaoke";
    if (!flag("--letter-anim")) props.letterAnim = "pop";
    if (!flag("--letter-var")) props.letterVar = 0.03;
    if (!flag("--size")) props.fontSize = 128;
    if (!flag("--shadow")) {
      // The white halo on every line: the feature REFERENCE.md measured as
      // missing versus the target video. Dark core underneath for legibility
      // where a light pool sits behind the text.
      props.shadow =
        "0 0 18px rgba(255,255,255,0.9), 0 0 60px rgba(255,255,255,0.4), 0 2px 10px rgba(0,0,0,0.65)";
    }
    const profilePath =
      STYLE_PROFILE_FILE || path.join(HERE, "styles", "default.json");
    try {
      props.profile = JSON.parse(fs.readFileSync(profilePath, "utf-8"));
    } catch (err) {
      console.error(
        "  Could not read style profile " + profilePath + ": " + err.message
      );
      process.exitCode = 1;
      return;
    }
    console.log(
      "  styled    : " + path.relative(HERE, profilePath) + "  (" +
      ((props.profile && props.profile.kind) || "aurora") + ")"
    );
    if (FORMAT === "mov") {
      console.warn(
        "  note: --styled paints an opaque plate, so a ProRes alpha channel\n" +
        "        will be flat 255. Styled mode is meant for mp4."
      );
    }
  } else if (STYLE_PROFILE_FILE) {
    console.error(
      "  --style-profile needs --styled: the overlay composition has no\n" +
      "  background for a profile to style."
    );
    process.exitCode = 1;
    return;
  }

  // The plan prints for the EFFECTIVE mode: styled defaults mode to mix without
  // --mode being typed, and a mixed video cannot be debugged from the picture.
  const EFFECTIVE_MODE = props.mode || MODE;
  const EFFECTIVE_BLOCK = Number(props.mixBlock) || (MIX ? MIX.block : 8);
  const EFFECTIVE_SPEC = props.mixPlanSpec || (MIX ? MIX.spec : "");
  if (EFFECTIVE_MODE === "mix") {
    // Print the plan. A mixed video cannot be debugged from the picture: "it
    // looked wrong at 2:40" points at nothing unless the log says what was on
    // screen at 2:40.
    //
    // A bad --mix-plan is caught here rather than allowed to throw.
    // parsePlan raises on an unknown presentation or a malformed chunk, and an
    // unhandled throw out of a CLI is a stack trace pointing at a source line,
    // which tells the person who typed the command nothing about what to type
    // instead.
    //
    // The import is outside the try because PRESENTATION_IDS is used in the
    // catch: a const declared inside the try is in its temporal dead zone in
    // the catch, so the error handler would itself throw a ReferenceError --
    // and it would do so while reporting some *other* error, which is how a
    // real "Cannot access 'seed' before initialization" ended up printed
    // underneath a paragraph about presentation names.
    const { buildMixPlan, describePlan, PRESENTATION_IDS } =
      await import("./src/mix.js");
    try {
      const plan = buildMixPlan({
        seed,
        cueCount: parsed.cues.length,
        block: EFFECTIVE_BLOCK,
        spec: EFFECTIVE_SPEC,
      });
      console.log(
        "  mix plan (" + plan.length + " cues, " +
          new Set(plan.map((p) => p.id)).size + " presentations):"
      );
      for (const line of describePlan(plan)) console.log("    " + line);
    } catch (err) {
      console.error("  " + (err && err.message ? err.message : String(err)));
      // Only nudge about the syntax when the error really is about the plan,
      // so a genuine bug is not buried under advice that does not apply.
      if (EFFECTIVE_SPEC) {
        console.error("  The eight presentations are: " + PRESENTATION_IDS.join(", "));
        console.error("  A chunk looks like  0-7:h-word  or  16+:*  (0-based cue indices).");
      }
      process.exitCode = 1;
      return;
    }
  }

  // Random font size. "word" varies each word of a line, "phrase" scales the
  // whole line once, "off" disables it. --size-var is the max deviation from
  // 1.0 (0.15 = 85%..115%) and is clamped: past 0.45 the small words stop
  // being readable at 1080p, which is the opposite of what this is for.
  const SIZE_MODE = flag("--size-mode") || "word";
  if (!["off", "phrase", "word"].includes(SIZE_MODE)) {
    console.error('  Unknown --size-mode "' + SIZE_MODE + '". Use word, phrase or off.');
    process.exit(1);
  }
  props.sizeMode = SIZE_MODE;
  const sizeVarRaw = numFlag("--size-var");
  // Three fallbacks in priority order: the preset, then the documented default.
  // Never 0 -- an absent flag is NaN, and NaN falling through to 0 would silently
  // switch size variation off (gotcha 28).
  props.sizeVar = Number.isFinite(sizeVarRaw)
    ? Math.min(Math.max(sizeVarRaw, 0), 0.45)
    : SIZE_PRESET ? SIZE_PRESET.sizeVar : 0.15;

  // --size-drift: a second, SLOWER size axis.
  //
  // --size-var varies each word statically, and that is all the eye learns from
  // after two lines: bigger word, smaller word, repeat. What makes a line look
  // performed rather than typeset is the size CHANGING -- a word growing as it
  // is sung and settling back, so the size itself carries the rhythm.
  //
  // This is a TRANSFORM on the whole word, never fontSize per letter, so the
  // shirorekha is untouched: every letter in the word scales together (the same
  // reasoning that lets the word layer scale freely and stops the letter layer
  // doing so).
  //
  // It also must not push a word past the frame edge, so the amplitude is
  // bounded hard and folded into the existing --size-var clamp.
  const driftRaw = numFlag("--size-drift");
  props.sizeDrift = Number.isFinite(driftRaw)
    ? Math.min(Math.max(driftRaw, 0), 0.35)
    : SIZE_PRESET ? SIZE_PRESET.sizeDrift : 0;
  // absent -> 0 (or the preset's value): an OFF-by-default feature, like
  // --motion (gotcha 30)
  if (props.sizeDrift > 0 && SIZE_MODE === "off") {
    console.warn(
      "  note: --size-drift needs per-word spans, so it is doing nothing with\n" +
      "        --size-mode off. Use --size-mode word (or phrase)."
    );
  }
  // Word-by-word animation. Each word is scheduled across the cue's span by
  // character count (src/word-timing.js) and animates as it arrives, while
  // still keeping the line's own entrance/exit. "off" keeps whole-line
  // animation, which is the previous behaviour.
  const WORD_ANIM = flag("--word-anim") || "off";
  // Validate against the REAL pool, not a copy of it. The list used to be
  // hardcoded here, so every effect added to WORD_ANIMS was rejected by this
  // check before it could ever render -- the pool grew and the gate silently
  // became a wall. scripts/check_animation.mjs reads the same source of truth,
  // so the two cannot disagree.
  if (!WORD_ANIM_LIST.includes(WORD_ANIM)) {
    console.error('  Unknown --word-anim "' + WORD_ANIM + '". Use: ' + WORD_ANIM_LIST.join(", "));
    process.exit(1);
  }
  props.wordAnim = WORD_ANIM;
  // Per-letter layer, nested inside each word span. Animation is safe at any
  // strength, EXCEPT that it may not scale: a per-letter scale steps the
  // shirorekha, which is the damage per-letter SIZE does by another road
  // (gotcha 8). Per-letter SIZE itself is clamped to 0.03, twice: here and in
  // LETTER_SIZE_CAP. A comment here used to say 0.12.
  const LETTER_ANIM = flag("--letter-anim") || "off";
  if (!LETTER_ANIM_LIST.includes(LETTER_ANIM)) {
    console.error('  Unknown --letter-anim "' + LETTER_ANIM + '". Use: ' + LETTER_ANIM_LIST.join(", "));
    process.exit(1);
  }
  props.letterAnim = LETTER_ANIM;
  const letterVarRaw = numFlag("--letter-var");
  props.letterVar = Number.isFinite(letterVarRaw)
    ? Math.min(Math.max(letterVarRaw, 0), 0.03)
    : 0;   // absent -> NaN -> 0, which IS the documented default here

  // --cut: the newspaper / cut-paper look (src/cut.js). Every word becomes a
  // clipping at its own angle and height, with a torn edge under it.
  //
  // OFF by default, and the same reason as --depth: this one deliberately breaks
  // the formation. It is allowed to look hand-assembled, which is a look, and a
  // look nobody chose is a look nobody can ask for again.
  const cutArg = flag("--cut") || "off";
  if (!CUT_LEVELS.includes(cutArg)) {
    console.error('  Unknown --cut "' + cutArg + '". Use one of: ' +
      CUT_LEVELS.join(", ") + ".");
    process.exitCode = 1;
    return;
  }
  props.cut = cutArg;
  if (cutArg !== "off") {
    console.log("  cut      : " + cutArg +
      (cutArg === "letter"
        ? "  (per word, plus per-LETTER rotation at the measured-safe angle cap)"
        : "  (per word: angle, lift, scale, torn edge)"));
  }

  // --type: the typed-on reveal. Letters appear left to right and STAY.
  //
  // It is a per-letter OPACITY/CLIP reveal, which is the safe side of the
  // shirorekha rule: a letter appearing does not move it. The word-level and
  // line-level parts are the same thing at a coarser grain, and the difference
  // is where the stagger is counted from -- which is why it is one flag with
  // three levels rather than three flags.
  //
  // It is also the one effect here that MUST finish inside the cue's end: a
  // letter that is still arriving when the line fades out is the lingering-lyric
  // bug, and a typing reveal is nothing BUT letters arriving late. The delay
  // chain is fitted to the cue's span for the same reason `sequence` is (see
  // src/depth.js) and check_typing.mjs asserts it.
  const typeArg = flag("--type") || "off";
  if (!TYPE_LEVELS.includes(typeArg)) {
    console.error('  Unknown --type "' + typeArg + '". Use one of: ' +
      TYPE_LEVELS.join(", ") + ".");
    process.exitCode = 1;
    return;
  }
  props.type = typeArg;
  if (typeArg !== "off") console.log("  type     : " + typeArg + "  (letters type on and hold)");

  // --stroke: a hairline outline on the glyphs, for legibility over bright
  // footage.
  //
  // AND THE HONEST WARNING, because this is the second time in this repo that a
  // "dark" effect turns out to do nothing at all:
  //
  //   Add   blending: output = base + overlay. A DARK overlay pixel adds NOTHING.
  //                   So a black outline is INVISIBLE under pure Add.
  //   Screen blending: output = 1-(1-base)(1-overlay). A black overlay pixel
  //                   DOES darken the footage.
  //
  // This project is blended "Add/Screen" over a Videosync2 camera feed, so which
  // one you actually use decides whether --stroke does anything at all. Under
  // pure Add, use --stroke-color white for a glow-style rim instead; under
  // Screen, the default dark stroke is correct. This is why --stroke-color is a
  // flag rather than a constant.
  const strokeRaw = numFlag("--stroke");
  if (Number.isFinite(strokeRaw)) {
    props.stroke = Math.min(Math.max(strokeRaw, 0), 8);
    props.strokeColor = flag("--stroke-color") || "#000000";
  }

  // --scanlines: additive horizontal bands across the WHOLE overlay.
  //
  // Bright, not dark, for the reason above: under Add blending a dark band adds
  // nothing. Applied as one repeating gradient on the root, so it costs one
  // element and cannot interact with the words' own transforms.
  const scanRaw = numFlag("--scanlines");
  if (Number.isFinite(scanRaw) && scanRaw > 0) {
    props.scanlines = Math.min(scanRaw, 60);
    props.scanlineAlpha = Number.isFinite(numFlag("--scanline-alpha"))
      ? Math.min(Math.max(numFlag("--scanline-alpha"), 0), 1)
      : 0.10;
    console.log(
      "  scanlines: " + props.scanlines + " bands at " +
      (props.scanlineAlpha * 100).toFixed(0) + "% (bright -- a dark band adds no light)"
    );
  }

  // --loudest: every layer at once, applied LAST.
  //
  // It exists because the alternative was nine flags typed by hand into five
  // commands, and that is how one of them ends up with a different --size-var
  // and produces a file that does not match its eight siblings with nothing to
  // show the difference.
  //
  // It is a SET OF DEFAULTS and nothing more: every one yields to an explicit
  // flag, so `--loudest --size 90` is the full treatment at a smaller size
  // rather than a fight between two settings. `flag()` is re-read here rather
  // than remembered from earlier, because "was this asked for" is the only
  // question that matters and argv is the only honest answer to it.
  //
  // This block sat BEFORE the size, letter and colour blocks and was silently
  // overwritten by all three -- the render looked plausible and was the wrong
  // size. A preset fills in what nobody asked for, so it has to be the last
  // writer. If you add another flag, add it here and nowhere else.
  if (has("--loudest")) {
    const set = (k, v) => { if (!flag(CLI_FOR_PROP[k])) props[k] = v; };
    set("depth", "wild");
    set("motion", "wild");
    set("wordAnim", "mix");
    set("letterAnim", "pop");
    set("letterVar", 0.03);
    set("sizeMode", "word");
    set("mode", "mix");
    set("colorMode", "wild");
    // These three have no string flag of their own -- they are numbers, and a
    // number's flag is absent-or-present, not present-or-absent-string -- so
    // they are checked directly rather than through the map above.
    if (!flag("--size") && !sizePresetArg) props.fontSize = 105;
    if (!numFlag("--size-var") && !sizePresetArg) props.sizeVar = 0.08;
    if (!numFlag("--size-drift") && !sizePresetArg) props.sizeDrift = 0.05;
    // --size-preset, if given, is the better answer than the hardcoded 105, and
    // it has already been applied above -- so it is left alone here.
    if (!flag("--mix-block")) props.mixBlock = 8;
    if (!flag("--color-hue")) props.colorHue = 210;
    if (!flag("--shadow")) props.shadow = "0 3px 16px rgba(0,0,0,0.85)";
    console.log(
      "  loudest  : depth wild, motion wild, word mix, letter pop at 0.03,\n" +
      "             size-mode word, mode mix (block 8), colour wild at 210deg,\n" +
      "             size " + props.fontSize + " var " + props.sizeVar +
      " drift " + props.sizeDrift
    );
  }
  // mp4 has no alpha: paint the background black so Add/Screen blend keying
  // is exact. mov keeps a transparent background.
  props.background = FORMAT === "mov" ? "transparent" : "#000000";
  // The preview length cap lives in calculateMetadata, next to the rest of
  // the duration maths. It used to be a --frames range on the command line,
  // computed from a different number, and the two disagreed (see Root.jsx).
  props.preview = PREVIEW;

  // --beats: the beat grid from scripts/detect_beats.py. An array of plain
  // numbers travels through props safely -- the one kind of structured data
  // that cannot hit the env-string trap (gotcha 1) or the inputProps
  // Devanagari-string loss (gotcha 20). Word starts quantize to it within
  // beatTol seconds; see src/beats.js for why it quantizes and never retimes.
  if (BEATS_FILE) {
    try {
      const doc = JSON.parse(fs.readFileSync(BEATS_FILE, "utf-8"));
      const arr = Array.isArray(doc) ? doc : doc && doc.beats;
      if (!Array.isArray(arr) || !arr.every((b) => Number.isFinite(Number(b)))) {
        throw new Error('expected {"beats": [seconds...]} or [seconds...]');
      }
      props.beats = arr.map(Number);
      // Only an EXPLICIT --beat-tol overrides the component default. An
      // absent flag is NaN, so this is false and the 0.4 default stands.
      if (Number.isFinite(BEAT_TOL) && BEAT_TOL >= 0) props.beatTol = BEAT_TOL;
      console.log(
        "  beats     : " + props.beats.length + " beats from " +
        path.basename(BEATS_FILE) +
        (doc && doc.bpm ? "  (" + Number(doc.bpm).toFixed(1) + " bpm, " + (doc.method || "detected") + ")" : "") +
        ", snap tol " + (props.beatTol ?? 0.4) + "s"
      );
    } catch (err) {
      console.error("  Could not use " + BEATS_FILE + ": " + err.message);
      process.exitCode = 1;
      return;
    }
  }

  // The font's measured width coefficients, so the auto-fit counts wrapped
  // lines from a measurement instead of a guess. See widthTableFor() for the
  // three guesses this replaced and why each was wrong.
  //
  // A legacy font is keyed by the family it registers under, not by the file,
  // because the calibration is of the face the browser will use.
  const widthInfo = widthTableFor(
    legacy ? legacy.family : fontFamilyName || flag("--font"),
    lrcPath
  );
  if (widthInfo.table) {
    props.widthModel = widthInfo.table;
    // The room between the glyph ink and the word box's lower edge, in em.
    //
    // This is what the `--cut word` tear bar has to fit inside, and it is a FONT
    // property: measured across the eleven faces in this batch it runs from
    // 0.006em to 0.474em. A constant bar height therefore drew a bright white
    // edge across the bottom of every letter in ten of the eleven -- and since
    // the bar sits BEHIND the text and the word animates its own opacity, the
    // line is seen through a translucent glyph exactly while it is being read.
    // In Devanagari a broken consonant is a different consonant.
    //
    // Measured by scripts/metrics_probe.py --write, cached beside the width table
    // because it is the same kind of fact about the same key.
    const room = Number(widthInfo.table.cutRoom);
    props.cutRoom = Number.isFinite(room) && room > 0 ? room : null;
    if (props.cutRoom == null) {
      console.warn(
        "  note: no measured ink room for this font (" +
          (legacy ? legacy.family : flag("--font")) + ")\n" +
          "        The --cut tear bar falls back to a very thin edge, because a bar\n" +
          "        drawn through the glyph bottoms is a wrong word and a thin one is\n" +
          "        only a lost effect.  py scripts\\metrics_probe.py --write"
      );
    }
    // A legacy font uses the per-code-point model, a Unicode font the
    // per-class one. Printing the per-class names for a per-char table showed
    // a row of dashes and looked like the font had no coefficients at all.
    const t = widthInfo.table;
    const c = typeof t.perChar === "number"
      ? "per code point " + t.perChar.toFixed(4) + " em  (legacy key font)"
      : ["cons", "matra", "space", "other"]
          .map((k) => k + " " + (t[k] == null ? "-" : t[k]))
          .join("  ");
    console.log(
      "  font      : " + (legacy ? legacy.family : flag("--font") || "(default stack)") +
        "   " + (widthInfo.song ? "fitted on this song's lines" : "per-font only") +
        "\n              width em: " + c +
        "\n              leave-one-out error " +
        (t.worstError * 100).toFixed(1) + "%" +
        (t.calibratedOn ? ", measured on " + t.calibratedOn : "")
    );
  } else {
    // Said out loud, and with the command to fix it, because the fallback is
    // exactly the thing that made the delivered render too small -- and a
    // silent 0.55 is how it shipped in the first place.
    console.warn(
      "  note: no width table for this font (" + widthInfo.note + ")\n" +
        "        The auto-fit falls back to per-class defaults, which are the old\n" +
        "        0.55em constant written out. Text may be smaller than it needs to\n" +
        "        be, or a long line may run off the bottom of the frame."
    );
  }

  // --prepare-only: do the encoding and font registration, write the props the
  // still command needs, then stop. This is how a new legacy font gets checked
  // in seconds instead of after a four-minute render.
  //
  // Nothing here is a shortcut around the render: it is the same code path up
  // to the point where the render would begin. The audio is deliberately NOT
  // copied in, because a still frame has no audio and copying it would leave a
  // 6 MB file in public/ for nothing.
  if (PREPARE_ONLY) {
    writeGenerated(renderLrc, "", legacy, 0, fontFile, fontFamilyName, endsText);
    const propsPath = path.join(outDir, "props.json");
    fs.writeFileSync(propsPath, JSON.stringify(props, null, 2), "utf8");
    console.log("  prepared src/lyrics.generated.js" + (legacy ? " (+ " + legacy.file + ")" : ""));
    console.log("  wrote " + path.relative(HERE, propsPath));
    // The frame is the middle of the LONGEST cue, not a fixed number: that is
    // the frame most likely to wrap, clip or fall back to a different typeface,
    // so it is the one worth looking at. A hard-coded 5900 happened to land on
    // a short line for every song tried, which made the check look like it had
    // passed.
    let worst = parsed.cues[0];
    for (const c of parsed.cues) {
      if (!worst || c.text.length > worst.text.length) worst = c;
    }
    const mid = Math.round(
      ((worst ? worst.time + (worst.end - worst.time) / 2 : 0) || 0) * fps
    );
    console.log(
      "  next: npx remotion still src/index.js " + COMP + " out/check.png " +
        "--frame=" + mid + " --props=" + path.relative(HERE, propsPath) +
        "\n        (longest cue: " + (worst ? worst.text.length : 0) +
        " characters at " + (worst ? worst.time.toFixed(2) : 0) + "s)"
    );
    return;
  }

  // Format-specific codec flags. ProRes 4444 carries a real alpha channel
  // and must stay PNG-frame (JPEG has no alpha); H.264 cannot hold alpha, so
  // the mp4 is white-on-black for blend-mode keying and takes JPEG frames
  // (~15% faster measured) plus 30fps to match the proven Videosync2 source.
  //
  // GPU ENCODING (--gpu)
  // ----------------------
  // Remotion silently ignores --hardware-acceleration whenever --crf is set
  // and prints "crf option is not supported with hardware acceleration", so
  // crf and a hardware encoder are mutually exclusive. The way to actually
  // use one is bitrate mode: --video-bitrate instead of --crf. At 1080p, 8M
  // measures the same as the crf-17 preset this file used, so --gpu swaps the
  // quality knob for a real GPU encode and nothing else.
  //
  // The value is "if-possible", NOT "nvenc". Remotion takes no encoder name
  // here -- the option is only disable | if-possible | required, and it picks
  // whatever the machine's ffmpeg supports, so an AMD box uses VA-API and
  // "nvenc" is not merely wrong but rejected outright before ffmpeg is ever
  // reached:
  //   Error: Invalid value for --hardware-acceleration: nvenc
  // "required" is also wrong here: it fails the whole render when no
  // hardware encoder exists, which is a worse outcome than quietly encoding
  // in software. "if-possible" tries, and falls back rather than dying.
  //
  // --gl=angle (below) is the other half of the GPU: that is the headless
  // Chromium rasteriser, and it is what draws the frames at all.
  const GPU = has("--gpu");
  const formatFlags = PREVIEW
    ? ["--scale=0.25", "--fps=15", "--codec=h264", "--crf=30"]
    : FORMAT === "mov"
      ? ["--codec=prores", "--prores-profile=4444", "--pixel-format=yuva444p10le"]
      // NOTE: do NOT pass the CLI --fps here. It OVERRIDES the composition
      // after metadata resolution and CLAMPS the frame count (a 30s
      // composition came out as 900 frames = 15s -- half the song). FPS
      // travels via props to calculateMetadata, which resolves it correctly.
      : GPU
        ? ["--codec=h264", "--video-bitrate=8M", "--pixel-format=yuv420p",
           "--image-format=jpeg", "--hardware-acceleration=if-possible"]
        : ["--codec=h264", "--crf=17", "--pixel-format=yuv420p", "--image-format=jpeg"];

  // GPU rasterisation for the headless Chromium that draws the frames is a
  // Remotion CLI flag, not an env var, so it goes on the command line.
  // `angle` is Remotion's default and uses the real GPU; `swiftshader` is the
  // software rasteriser, kept as the escape hatch for machines where ANGLE
  // fails to initialise.
  const glFlag = GPU ? ["--gl=" + (flag("--gl") || "angle")] : [];

  const cliArgs = [
    "render", "src/index.js", COMP, outPath,
    ...formatFlags,
    ...glFlag,
    ...(NO_AUDIO ? ["--muted"] : []),
    "--props=" + JSON.stringify(props),
  ];

  console.log("  seed : " + seed);
  console.log(
    "  mode : " +
    (PREVIEW
      ? "PREVIEW (fast)"
      : STYLED
        ? "FINAL (styled full-frame, H.264 mp4)"
        : FORMAT === "mov"
          ? "FINAL (ProRes 4444, alpha)"
          : "FINAL (H.264 mp4, black bg -- blend Add/Screen)") +
    (NO_AUDIO ? " | text-only, no audio track" : "") +
    "\n"
  );

  // Only width/height stay as env vars; they are plain numbers read with
  // Number() and an unset one becomes NaN rather than a truthy string.
  const env = { ...process.env };
  if (flag("--font")) env.LYRIC_FONT = flag("--font");

  const cliJs = path.join(HERE, "node_modules", "@remotion", "cli", "remotion-cli.js");
  if (!fs.existsSync(cliJs)) {
    console.error("  Remotion CLI not found. Run: npm install");
    process.exitCode = 1;
    return;
  }

  if (has("--debug-args")) console.log("  ARGS: " + JSON.stringify([cliJs, ...cliArgs], null, 1));
  execFileSync(process.execPath, [cliJs, ...cliArgs], {
    stdio: "inherit",
    cwd: HERE,
    env,
  });

  const size = fs.existsSync(outPath) ? fs.statSync(outPath).size : 0;
  console.log("\n  OK  " + outPath + "  (" + (size / 1024 / 1024).toFixed(1) + " MB)");
  if (!PREVIEW) {
    console.log(
      STYLED
        ? "      Full-frame deliverable -- plays as-is, no blend mode needed."
        : FORMAT === "mov"
          ? "      Drop onto a Videosync2 video layer, camera underneath."
          : "      Videosync2: set the layer blend to Add or Screen -- black disappears."
    );
  }
}

// -- main ------------------------------------------------------------------
if (BATCH) {
  const files = fs.readdirSync(BATCH);
  const audio = files.filter((f) => /\.(mp3|wav|m4a|ogg|flac)$/i.test(f));
  if (!audio.length) {
    console.error("No audio files in " + BATCH);
    process.exit(1);
  }
  for (const a of audio) {
    const base = a.replace(/\.[^.]+$/, "");
    const lrc = files.find((f) => f.toLowerCase() === (base + ".lrc").toLowerCase());
    if (!lrc) {
      console.log("  skip " + a + " -- no matching .lrc");
      continue;
    }
    await run(path.join(BATCH, a), path.join(BATCH, lrc));
  }
} else {
  if (positional.length < 2) {
    console.log([
      "",
      "  render.mjs -- transparent lyric overlay from a Song Timer .lrc",
      "",
      "    node render.mjs <audio> <lyrics.lrc> [options]",
      "",
      "    --preview        fast, small, no alpha -- check timing first",
      "    --no-audio       leave the audio track out of the output",
      "    --font <family>  font family to render with",
      "    --font-file <f> use a local .ttf AS IS -- no key layout, no\n" +
        "                     conversion, so no risk of wrong letters. The family\n" +
        "                     name is read from the font, not from a flag. This\n" +
        "                     is how a distinctive Unicode Devanagari face is\n" +
        "                     used; --legacy-font is the opposite and cannot be\n" +
        "                     combined with it.",
      "    --mode <mode>    center (default) | roam (random spot per line) |\n" +
        "                     horizontal (one left-aligned band; pair with karaoke) |\n" +
        "                     vertical (one centred narrow column) |\n" +
        "                     mix (all of them, planned across the song)\n" +
        "    --mix-block <n>  cues per presentation in mix mode (default 8, min 4).\n" +
        "                     Below 4 it is a flicker, not variety: Allare's\n" +
        "                     median cue is 1.4s.\n" +
        "    --mix-plan <s>   pin a verse: \"0-7:h-word,8-15:v-phrase,16+:*\"\n" +
        "                     0-based cue indices. The eight presentations are\n" +
        "                     h-word h-phrase v-word v-phrase c-word c-phrase\n" +
        "                     r-word r-phrase; \"*\" hands back to the automatic walk.\n" +
        "    --motion <lvl>   per-line motion choreography: off (default) |\n" +
        "                     calm | vivid | wild. Seeded deck, so no two\n" +
        "                     neighbouring lines share a motion and every\n" +
        "                     motion in the pool is used. Each line's travel is\n" +
        "                     clamped to its placement's real frame margin, and\n" +
        "                     every animation is finished inside the cue's own\n" +
        "                     tapped end time (gotcha 31).\n" +
        "    --motion-block <n>  cues per motion before the deck reshuffles (default 7).",
      "    --format <fmt>   mp4 (h264 black bg, default) | mov (prores alpha)",
      "    --legacy-font <f> use a Preeti-era font (.ttf), converting the lyrics\n                     to its key layout (needs python + npttf2utf);",
      "    --fps <n>        output frame rate (default: 30 mp4 / 60 mov)",
      "    --report-only    just print the cue list",
      "    --ends <file>    end timings; by default looked for beside the .lrc as\n                     <song>.remotion_end.lrc, then <song>.ends.txt",
      "    --allow-stale-ends  render even if most ends cannot be applied",
      "    --allow-missing-ends  render even if NO ends file is found; every line\n" +
        "                     is then estimated from the next line's start, which\n" +
        "                     is why it is not the default (gotcha 19, 37)",
      "    --check          preflight only: verify timings, then exit",
      "    --title-card     show the song title + band at the start",
      "    --title-card-outro  also repeat the title at the end",
      "    --style <name>   pin one animation: " + STYLES.join(", "),
      "    --position <pos> top | center | bottom",
      "    --size <px>      font size (default 104)",
      "    --size-mode <m>  word (vary each word) | phrase | off   (default word)",
      "    --size-var <n>   how far sizes vary, 0..0.45 (default 0.15 = +-15%)",
      "    --word-anim <m>  off (default) | reveal | karaoke | pulse",
      "    --letter-anim <m>  off (default) | fade | rise | pop | wipe",
      "    --letter-var <n>   per-letter size, 0..0.03 (clamped hard: the",
      "                      shirorekha is continuous across a word)",
      "    --title-card / --title-card-outro",
      "    --color <#hex>   text colour (one colour for the whole render)",
      "    --color-mode <m> off (default) | calm | vivid | wild -- seeded",
      "                      per-word colour, and per-letter from vivid up.",
      "                      Ranges are bounded for the Add/Screen overlay:",
      "                      lightness is floored so a word cannot go dark",
      "                      over footage. See src/color.js.",
      "    --color-hue <deg>  palette anchor, 0..359 (default 210)",
      "    --size-preset <n> small | medium | large -- the three sizes judged",
      "                      on Kali Kali. medium is the house default; any",
      "                      explicit --size/--size-var/--size-drift wins.",
      "    --word-fill <f>  fraction of each cue the words occupy (default",
      "                      0.78). The rest is a hold: the finished line sits",
      "                      readable before the next arrives, which is the gap",
      "                      before the upcoming word. 1 = the old behaviour, no",
      "                      hold. Laying words across the full span starved the",
      "                      last word of most of its screen time -- 146 of 450",
      "                      cues across the seven songs -- so this is on by",
      "                      default. See WORD_FILL in src/word-timing.js.",
      "    --cut <m>     off (default) | word | letter -- the newspaper look:",
      "                      every word a clipping at its own angle and height",
      "                      with a torn edge. `letter` adds per-letter",
      "                      rotation, capped at LETTER_ANGLE_CAP.",
      "    --type <m>   off (default) | line | word | letter -- typed-on",
      "                      reveal. Letters arrive left to right and STAY.",
      "                      The delay chain is fitted to the cue's span.",
      "    --stroke <px>    hairline on the glyph outline, 0..8",
      "    --stroke-color <#hex>  default #000000. NOTE: a DARK stroke only",
      "                      shows under Screen blending; under pure Add it",
      "                      adds no light and is invisible.",
      "    --scanlines <n>  bright bands over the whole overlay (bright, because",
      "                      a dark band adds nothing under Add blending)",
      "    --loudest     every layer at once: --depth wild --motion wild",
      "                      --word-anim mix --letter-anim pop --letter-var 0.03",
      "                      --size-mode word --mode mix --mix-block 8",
      "                      --color-mode wild --color-hue 210, size 105.",
      "                      A SET OF DEFAULTS: any explicit flag wins.",
      "    --seed <text>    animation seed (default: title from the .lrc)",
      "    --batch <dir>    render every audio+.lrc pair in a folder",
      ""
    ].join("\n"));
    process.exit(0);
  }
  await run(path.resolve(positional[0]), path.resolve(positional[1]));
}
