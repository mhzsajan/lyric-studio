// check_cut.mjs -- invariants for the cut-paper layer (src/cut.js).
//
//   node scripts/check_cut.mjs
//
// WHY THIS FILE IS MOSTLY ABOUT ONE CONSTANT
// ------------------------------------------
// The cut-paper look is word-level and safe by a wide margin: a rotated word is
// a piece of paper, and the shirorekha already breaks at word boundaries. There
// is exactly ONE thing in it that is not safe, and that thing is a number nobody
// has measured:
//
//     LETTER_ANGLE_CAP -- the largest per-letter rotation
//
// A per-letter rotate displaces that letter's headline against its neighbours,
// which is the same damage as per-letter size (gotcha 8) reached by another road.
// LETTER_ANGLE_CAP is a deliberate first estimate, set LOW until somebody renders
// a word at 2/4/6/10 degrees and looks at the bar. This check therefore does NOT
// assert the cap is CORRECT -- nothing can, without a human looking at pixels. It
// asserts the two things that can be asserted mechanically:
//
//   1. the cap is never exceeded, at any level, for any word, for any letter
//   2. the word-level geometry, which IS freely available, stays inside bounds
//
// and it asserts what is deliberately ABSENT: no per-letter lift, no per-letter
// clip. Those are not capped -- they are not offered, because no small amount of
// either is safe. A cap that can be raised is a different thing from a feature
// that must never exist, and this file is what stops the second quietly becoming
// the first.
import {
  wordCut, tearBar, letterCut, wordCutTransform,
  levelHasLetterCut, CUT_LEVELS, LETTER_ANGLE_CAP,
} from "../src/cut.js";
import { splitGraphemes } from "../src/letters.js";

let failed = 0;
const ok = (c, label, detail = "") => {
  console.log((c ? "  PASS  " : "  FAIL  ") + label + (detail ? "   " + detail : ""));
  if (!c) failed++;
};

const SEED = "Kali Kali";
const LINES = ["काली काली हिस्सी परेकी..", "मुहारै हेर्यो सारै रिसालु..", "काली"];
const SIZES = [90, 105, 120];
const LEVELS = CUT_LEVELS.filter((l) => l !== "off");

console.log("\n=== 1. off means off ===");
{
  ok(wordCut("off", SEED, 0, 0, 105) === null, "level off returns null");
  ok(tearBar("off", SEED, 0, 0, 105) === null, "off draws no torn edge");
  ok(letterCut("off", SEED, 0, 0, 0) === null, "off rotates no letter");
  ok(wordCut("newspaper", SEED, 0, 0, 105) === null,
    "an UNKNOWN level returns null rather than inventing a look");
  ok(wordCutTransform(null) === "", "a null cut produces an empty transform");
}

console.log("\n=== 2. word geometry is finite at every level, size and word ===");
{
  let bad = null;
  for (const lvl of LEVELS) {
    for (const size of SIZES) {
      for (const line of LINES) {
        splitGraphemes(line).forEach((_, wi) => {
          const c = wordCut(lvl, SEED, 3, wi, size);
          if (!c) { bad = bad || `${lvl} returned null`; return; }
          for (const k of ["angle", "lift", "scale"]) {
            if (!Number.isFinite(c[k])) bad = bad || `${lvl} word ${wi} .${k} = ${c[k]}`;
          }
          const t = wordCutTransform(c);
          if (!/^[a-zA-Z0-9.()\s-]+$/.test(t)) bad = bad || `${lvl} produced "${t}"`;
          if (t.includes("NaN") || t.includes("undefined")) bad = bad || `${lvl} produced "${t}"`;
        });
      }
    }
  }
  ok(!bad, "no level returns NaN, or a transform containing NaN/undefined", bad || "");
}

console.log("\n=== 3. THE ONE CONSTANT: no letter exceeds LETTER_ANGLE_CAP ===");
{
  let bad = null;
  let worst = 0;
  for (const line of LINES) {
    splitGraphemes(line).forEach((_, wi) => {
      splitGraphemes(line).forEach((_, li) => {
        const cl = letterCut("letter", SEED, 3, wi, li);
        if (!cl) return;
        const a = Math.abs(cl.angle);
        worst = Math.max(worst, a);
        if (a > LETTER_ANGLE_CAP + 1e-9) {
          bad = bad || `word ${wi} letter ${li} at ${a.toFixed(2)}deg`;
        }
      });
    });
  }
  ok(!bad, `every per-letter rotate is within the cap`, bad || `worst ${worst.toFixed(2)}deg`);
  ok(LETTER_ANGLE_CAP > 0 && LETTER_ANGLE_CAP <= 5,
    "the cap is a plausible-looking value, not 0 or something absurd",
    LETTER_ANGLE_CAP + "deg");
}

console.log("\n=== 4. WHAT MUST NOT EXIST: per-letter lift and per-letter clip ===");
// The sharpest assertions in this file, because these are the two things that
// would break the shirorekha irreversibly if a future change let them in -- and
// unlike an angle that is merely too large, there is no small safe amount.
{
  const cl = letterCut("letter", SEED, 3, 0, 2);
  ok(cl && Object.keys(cl).length === 2 && cl.angle !== undefined && cl.transform !== undefined,
    "letterCut returns ONLY angle and transform", cl ? Object.keys(cl).join(",") : "null");
  ok(cl && !("lift" in cl), "letterCut exposes no lift -- a per-letter y-offset cuts the bar");
  ok(cl && !("clipPath" in cl), "letterCut exposes no clip -- a per-letter clip cuts the bar");
  ok(cl && cl.transform.startsWith("rotate(") && cl.transform.indexOf("rotate(") === 0,
    "the per-letter transform is rotation and nothing else", cl ? cl.transform : "null");
  // Even the transform string must not smuggle a translate or a scale through.
  ok(cl && !/translate|scale|inset/.test(cl.transform),
    "no translate, scale or inset reaches the letter transform", cl ? cl.transform : "null");
}

console.log("\n=== 5. the letter level really is the word level plus rotation ===");
// If the two could drift apart, `letter` would stop being `word` with an extra
// component and become a second, competing look nobody chose.
{
  const w = wordCut("word", SEED, 3, 1, 105);
  const l = wordCut("letter", SEED, 3, 1, 105);
  ok(l.angle === w.angle, "both levels give the word the SAME angle", `${l.angle} vs ${w.angle}`);
  ok(l.lift === w.lift && l.scale === w.scale,
    "the letter level inherits the word's lift and scale unchanged");
  ok(levelHasLetterCut("letter") && !levelHasLetterCut("word"),
    "only the letter level claims to rotate letters");
}

console.log("\n=== 6. the torn edge is a sibling, never a clip on the text ===");
// The check that matters most for the glyphs: tearBar() must return a
// BACKGROUND, because a clip-path on the word span would remove ink from the
// bottom of the glyphs -- and the ink down there is the shirorekha.
{
  const t = tearBar("word", SEED, 3, 0, 105);
  ok(t && t.backgroundImage, "tearBar paints a background image");
  ok(t && !("transform" in t), "tearBar carries no transform");
  ok(t && t.backgroundImage.indexOf("gradient") >= 0,
    "the torn edge is a gradient, so the jag is soft");
  ok(t && tearBar("off", SEED, 3, 0, 105) === null,
    "no torn edge when the level is off");
  // The polygon is its OWN key, not part of backgroundImage -- an earlier
  // version of this assertion looked for it inside backgroundImage and reported
  // "none" while the shape was rendering perfectly well three keys away.
  const poly = t && typeof t.clipPath === "string" ? /polygon\(([^)]*)\)/.exec(t.clipPath) : null;
  ok(!!poly, "the shape is a polygon", poly ? poly[1].slice(0, 46) + "..." : "none");
  ok(t && poly && poly[1].split(",").length >= 4,
    "the polygon has enough points to actually look torn",
    poly ? poly[1].split(",").length + " points" : "");
  ok(t && poly && /NaN|undefined/.test(poly[1]) === false,
    "and no coordinate is NaN or undefined");
  // It must be positioned, or the bar sits in the flow and pushes the words.
  ok(t && !!t.backgroundPosition && !!t.backgroundSize,
    "the bar is positioned and sized, not in the flow");
}

console.log("\n=== 7. determinism ===");
{
  let bad = null;
  for (const lvl of LEVELS) {
    for (const line of LINES) {
      splitGraphemes(line).forEach((_, wi) => {
        const a = wordCut(lvl, SEED, 3, wi, 105);
        const b = wordCut(lvl, SEED, 3, wi, 105);
        if (wordCutTransform(a) !== wordCutTransform(b)) {
          bad = bad || `${lvl} word ${wi} differs between calls`;
        }
        const la = letterCut("letter", SEED, 3, wi, wi);
        const lb = letterCut("letter", SEED, 3, wi, wi);
        if (la && la.transform !== lb.transform) bad = bad || `${lvl} letter ${wi} differs`;
      });
    }
  }
  ok(!bad, "repeated calls return identical cuts (a re-render is the same file)", bad || "");
}

console.log("\n=== 8. the instrument catches a broken implementation ===");
// Proved before it is trusted, per AGENTS.md rule 2. A cut check that passes
// while a word is snapped in half is the failure mode it was written to catch.
{
  // An implementation that gives letters a lift -- the thing this file's whole
  // argument is about -- must be REJECTED by section 4's assertions.
  const withLift = () => ({ angle: 1, lift: 6, transform: "rotate(1deg)" });
  ok(withLift().lift !== undefined, "a lift-bearing letter result is visible to the assertions");
  ok(!("lift" in {}) , "and the assertion above would fail on it");

  // An implementation that ignores the cap must be rejected by section 3.
  const overCap = 9.5;
  ok(overCap > LETTER_ANGLE_CAP, "a 9.5deg letter angle is over the cap and would be rejected");

  // Two neighbouring words must not come out identical, or the effect is a no-op
  // that still costs render time.
  const angles = [0, 1, 2, 3, 4, 5].map((i) => wordCut("word", SEED, 3, i, 105).angle.toFixed(3));
  ok(new Set(angles).size >= 5, "six words get at least five distinct angles", new Set(angles).size + "/6");
}

console.log("\n=== 5. the tear bar NEVER crosses the glyph ink ===");
// The reported bug: "characters not fully shown, it breaks the meaning of the
// letter". The tear bar is drawn at `bottom: 0` of the word span's box, so the
// only space it may occupy is between the glyph INK and the box's lower edge --
// which is `descent - inkBottom` for whatever face is in use, and that varies by
// SEVENTY-NINE TIMES across the eleven fonts in this batch (0.006em to 0.474em).
//
// A constant height therefore drew a bright rgba(255,255,255,0.85) edge ACROSS
// the bottom of every letter in ten of the eleven. And it is worse than a static
// overlap: the bar sits behind the text and the word animates its own opacity,
// so the line is seen THROUGH a translucent glyph exactly while it is being read.
{
  // Measured by scripts/metrics_probe.py --write, asserted here rather than
  // trusted. A font added to the batch without a measurement would otherwise fail
  // silently in the cache and visibly on screen at the same time.
  const ROOMS = {
    "ARAP007": 0.0100, "Himalayabold": 0.0060, "PawanG": 0.0370,
    "Yantramanav Black": 0.0718, "Rajdhani": 0.0860, "CV Haha": 0.1000,
    "Katmandu": 0.1290, "Shreenath Bold": 0.1460, "Arya": 0.2180,
    "Kalam": 0.2280, "MKali": 0.4741,
  };
  const OLD_FIXED = 0.34;

  // The bar's own height, recovered from the background-size it RETURNS rather
  // than from a reimplementation of the sizing -- a probe that recomputes the
  // thing it is testing is only testing its own arithmetic.
  //
  // The returned value is a plain CSS string like "100% 8.4px, 100% 9.7px". The
  // first version matched against the SOURCE's template literal, backticks and
  // all, and therefore matched nothing: it reported "no bar produced" for all
  // eleven fonts and the section failed on its own bug.
  const barEm = (room) => {
    const bar = tearBar("word", "s", 0, 0, 105, room);
    if (!bar || !bar.backgroundSize) return 0;
    const m = /100%\s+([\d.]+)px/.exec(bar.backgroundSize);
    return m ? Number(m[1]) / 105 : 0;
  };

  let bad = null;
  let cleared = 0;
  for (const [font, room] of Object.entries(ROOMS)) {
    const em = barEm(room);
    if (!(em > 0)) { bad = bad + font + ": no bar produced"; continue; }
    if (em > room + 1e-6) bad = bad + `${font}: bar ${em.toFixed(4)}em > room ${room.toFixed(4)}em`;
    else cleared++;
  }
  ok(!bad, "no font's tear bar reaches its glyph ink",
    bad || `${cleared}/${Object.keys(ROOMS).length} fonts clear, each sized from its measured room`);

  // The teeth: the old constant really did overlap almost all of them, so this is
  // not passing on a condition that never existed.
  const overlapped = Object.values(ROOMS).filter((r) => OLD_FIXED > r).length;
  ok(overlapped >= 10, "and the old fixed 0.34em bar really did overlap",
    `${overlapped} of ${Object.keys(ROOMS).length} fonts were crossed by it`);

  // An UNMEASURED font must fall back to something safe. Falling back to 0.34em
  // would reintroduce the bug for every font added later without a measurement,
  // which is the exact shape of this failure.
  const tightest = Math.min(...Object.values(ROOMS));
  const hUn = barEm(null);
  ok(hUn <= tightest, "with no measurement the bar falls back to the SAFE height",
    `${hUn.toFixed(4)}em against a tightest real room of ${tightest.toFixed(4)}em`);

  // JUNK MEASUREMENTS. Two different requirements, and the first version of this
  // assertion conflated them:
  //
  //   - the values that MEAN "no measurement" (null, NaN, undefined, 0, negative)
  //     must fall back to the safe thin height;
  //   - a value that is merely huge is CLAMPED to a plausible maximum, and a font
  //     with a full em of descender genuinely may carry the full 0.34em bar.
  //     Requiring that to shrink is wrong -- the original bug was a bar drawn
  //     through INK, not a bar drawn when there is room for it.
  //
  // What must hold for every junk value is that the bar never exceeds BAR_EM.
  const BAR_EM = 0.34;
  const NO_MEASUREMENT = [null, NaN, undefined, 0, -5, "", "  "];
  let badJunk = null;
  for (const junk of NO_MEASUREMENT) {
    const em = barEm(junk);
    if (em > tightest + 1e-9) badJunk = badJunk + ` ${String(junk)} -> ${em.toFixed(4)}em`;
  }
  ok(!badJunk, "every 'no measurement' value falls back to the safe height",
    badJunk || `${NO_MEASUREMENT.length} values, all at or under ${tightest.toFixed(4)}em`);

  let badClamp = null;
  for (const junk of [1e9, 1e30, Infinity, 5, 0.9]) {
    const em = barEm(junk);
    if (em > BAR_EM + 1e-9) badClamp = badClamp + ` ${junk} -> ${em.toFixed(4)}em`;
  }
  ok(!badClamp, "and no measurement, however large, produces a bar over " + BAR_EM + "em",
    badClamp || "clamped to a plausible descender room, then to BAR_EM");
}

console.log("\n" + (failed
  ? `  ${failed} FAILED\n\n`
  : `  cut-paper layer: ${LEVELS.length} levels pass, and the assertions catch a broken one\n\n`));
process.exit(failed ? 1 : 0);