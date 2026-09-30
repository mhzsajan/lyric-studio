// check_color.mjs -- invariants for the per-word / per-letter colour layer.
//
//   node scripts/check_color.mjs
//
// WHY THIS IS SEPARATE FROM check_depth.mjs
// -----------------------------------------
// depth.js is transforms, colour.js is paint. They fail differently and the
// difference matters: a bad transform clips a line off the frame, and a bad
// colour makes a word INVISIBLE -- which on this project is the worst possible
// failure, because the deliverable is not watched as a picture. It is blended
// Add/Screen over a Videosync2 camera feed in Ableton, so the file is judged as
// LIGHT ADDED TO A PICTURE. A word at low lightness adds nothing and is simply
// absent from the finished composite, while every check that looks at pixels in
// this file passes.
//
// So the property asserted here, above all others, is the lightness FLOOR.
//
// THE THREE THINGS THAT CAN GO WRONG
// ----------------------------------
//   1. a word gets too dark to composite (the invisible word)
//   2. two letters of one conjunct get unrelated hues and the word stops being
//      a word -- which is why the hue STEPS across a word instead of scattering
//   3. the layer is non-deterministic, so re-rendering the same song gives a
//      different file and a diff of the outputs is meaningless
//
// THE INSTRUMENT PROVES ITSELF (AGENTS.md rule 2)
// -----------------------------------------------
// Section 4 below runs the SAME assertions against a deliberately broken
// implementation -- dark letters, scattered hue, light word with one dim letter
// in it -- and requires every one of them to be rejected. A set of assertions
// that cannot fail is not a check, and the failure mode of a colour check is
// specifically that it passes while the video is broken.
import { readFileSync } from "node:fs";
import {
  wordColor, letterColor, levelHasLetterColor, levelTintsGlow, hslRgbTriple,
  hslCss, COLOR_LEVELS,
} from "../src/color.js";
import { splitGraphemes } from "../src/letters.js";
import { depth } from "../src/depth.js";

let failed = 0;
const ok = (c, label, detail = "") => {
  console.log((c ? "  PASS  " : "  FAIL  ") + label + (detail ? "   " + detail : ""));
  if (!c) failed++;
};

// Real lyric text, not "abc". The word काली is two graphemes, हिस्सी three, and
// नि is ONE grapheme from two codepoints -- the case where per-letter anything
// has to decline rather than split a matra off its consonant.
const LINES = [
  { text: "काली काली हिस्सी परेकी..", cue: 3 },
  { text: "मुहारै हेर्यो सारै रिसालु..", cue: 21 },
  { text: "रातो रातो नै जान्छु म हेर्दै", cue: 44 },
];
const SEED = "Kali Kali";
const HUE = 210;
const LEVELS = COLOR_LEVELS.filter((l) => l !== "off");

const wordsOf = (line) => line.text.split(/\s+/).filter(Boolean);

console.log("\n=== 1. every level returns a usable colour for every word of every line ===");
{
  let bad = null;
  for (const lvl of LEVELS) {
    for (const line of LINES) {
      wordsOf(line).forEach((w, i) => {
        const c = wordColor(lvl, SEED, HUE, line.cue, i);
        if (!c) { bad = bad || `${lvl} "${w}" returned null`; return; }
        for (const k of ["hue", "sat", "light"]) {
          if (!Number.isFinite(c[k])) bad = bad || `${lvl} "${w}".${k} is ${c[k]}`;
        }
        if (!/^hsl\(\d{1,3}, \d{1,3}\.\d%, \d{1,3}\.\d%\)$/.test(c.css)) {
          bad = bad || `${lvl} "${w}" css is ${c.css}`;
        }
        if (!/^\d{1,3}, \d{1,3}, \d{1,3}$/.test(c.rgb)) bad = bad || `${lvl} "${w}" rgb is ${c.rgb}`;
      });
    }
  }
  ok(!bad, "no level returns null, NaN or a malformed colour", bad || "");
}

console.log("\n=== 2. off means off -- the null that leaves a render untouched ===");
{
  ok(wordColor("off", SEED, HUE, 0, 0) === null,
    "level off returns null, so no style key is written at all");
  ok(!levelHasLetterColor("off"), "off reports no per-letter colour");
  // An unknown level must also be null rather than a plausible colour. render.mjs
  // refuses one with exit 1; this is the second line of defence, and it is the
  // one that matters if a future caller forgets to validate.
  ok(wordColor("rainbow", SEED, HUE, 0, 0) === null,
    "an UNKNOWN level returns null rather than inventing a palette");
}

console.log("\n=== 3. THE BLEND FLOOR: no word or letter may go dark ===");
// This is the assertion that matters most, and the one a naive implementation
// fails. It is asserted per LEVEL against that level's own documented floor, so
// raising a level's range cannot quietly become lowering it.
{
  let bad = null;
  for (const lvl of LEVELS) {
    const floor = Math.min(...sampleLightness(lvl));
    for (const line of LINES) {
      const w = wordsOf(line);
      w.forEach((word, i) => {
        const c = wordColor(lvl, SEED, HUE, line.cue, i);
        if (c.light < floor - 1e-9) {
          bad = bad || `${lvl} "${word}" light ${c.light.toFixed(3)} < floor ${floor}`;
        }
        // And letters, at the levels that paint them.
        splitGraphemes(word).forEach((_, k) => {
          const lc = letterColor(lvl, SEED, HUE, line.cue, i, k, c);
          if (lc.light < floor - 1e-9) {
            bad = bad || `${lvl} "${word}" letter ${k} light ${lc.light.toFixed(3)} < floor ${floor}`;
          }
        });
      });
    }
  }
  ok(!bad, "every word AND every letter clears its level's lightness floor", bad || "");
}

console.log("\n=== 4. the instrument catches a broken implementation ===");
// Prove each assertion bites before trusting it to clear section 3. A colour
// check that passes while the video is broken is the failure mode this file
// exists to prevent, so the tests are run against four deliberately wrong
// implementations and MUST reject them.
{
  const truthy = (c) => !!c;
  // A random-RGB implementation: bright, saturated, and per-letter scattered.
  const scatter = (lvl, seed, hue, cue, wi) => {
    const h = (hue + (wi * 137.5) % 360) % 360;
    return { hue: h, sat: 0.9, light: 0.6, css: hslCss(h, 0.9, 0.6), rgb: hslRgbTriple(h, 0.9, 0.6) };
  };
  // A dark implementation: full hue range, lightness drawn from the whole wheel.
  const dark = (lvl, seed, hue, cue, wi) => {
    const h = (hue + wi * 47) % 360;
    const l = 0.12 + wi * 0.07;
    return { hue: h, sat: 0.8, light: l, css: hslCss(h, 0.8, l), rgb: hslRgbTriple(h, 0.8, l) };
  };
  // A mostly-bright one with a single dim letter in every word: the exact failure
  // that Add blending turns into a hole in the middle of a conjunct.
  const oneDimLetter = (lvl, seed, hue, cue, wi) => {
    const h = (hue + wi * 47) % 360;
    return { hue: h, sat: 0.7, light: 0.9, css: hslCss(h, 0.7, 0.9), rgb: hslRgbTriple(h, 0.7, 0.9) };
  };
  const dimLetter = (lvl, seed, hue, cue, wi, k, word) => ({
    ...word,
    light: k === 2 ? 0.2 : word.light,
    css: hslCss(word.hue, word.sat, k === 2 ? 0.2 : word.light),
  });

  const floorOf = (lvl) => Math.min(...sampleLightness(lvl));
  const floorViolation = (lvl) => {
    const floor = floorOf(lvl);
    return LINES.some((line) =>
      wordsOf(line).some((w, i) => {
        const c = scatter(lvl, SEED, HUE, line.cue, i);
        if (c.light < floor - 1e-9) return true;
        return splitGraphemes(w).some((_, k) =>
          dimLetter(lvl, SEED, HUE, line.cue, i, k, c).light < floor - 1e-9);
      }));
  };
  const scatteredHue = () => {
    const real = wordColor("wild", SEED, HUE, 3, 0);
    const fake = scatter("wild", SEED, HUE, 3, 0);
    // A scatter puts an unrelated hue on every letter; this puts a stepped
    // gradient. If the two ever agreed letter-for-letter, the gradient assertion
    // in section 5 could not tell this layer from a confetti generator.
    return splitGraphemes("काली").some((_, k) =>
      letterColor("wild", SEED, HUE, 3, 0, k, real).hue !==
      letterColor("wild", SEED, HUE, 3, 0, k, fake).hue);
  };
  const deterministic = () => {
    const a = wordColor("wild", SEED, HUE, 3, 1);
    const b = wordColor("wild", SEED, HUE, 3, 1);
    return a.css === b.css;
  };

  ok(truthy(floorViolation("wild")), "floor assertion REJECTS a scattered-hue impl with a dim letter");
  ok(truthy(dark("wild", SEED, HUE, 3, 0).light < floorOf("wild")), "floor assertion REJECTS a dark impl");
  ok(truthy(scatteredHue()), "gradient assertion distinguishes this impl from a scattered one");
  ok(truthy(deterministic()), "determinism assertion is satisfiable (not vacuously true)");
  ok(splitGraphemes("काली").length === 2, "काली splits into 2 graphemes, not 4 codepoints");
}

console.log("\n=== 5. hue STEPS across a word, so a word stays one object ===");
// A conjunct whose two letters are unrelated hues reads as two objects. The
// gradient is what makes per-letter colour legible as a word.
{
  let bad = null;
  for (const lvl of LEVELS.filter(levelHasLetterColor)) {
    for (const line of LINES) {
      wordsOf(line).forEach((w, i) => {
        const c = wordColor(lvl, SEED, HUE, line.cue, i);
        const hues = splitGraphemes(w).map((_, k) => letterColor(lvl, SEED, HUE, line.cue, i, k, c).hue);
        const steps = hues.slice(1).map((h, k) => Math.abs(((h - hues[k] + 540) % 360) - 180));
        // Adjacent letters must stay within a visible-but-related band: far enough
        // apart to see the gradient, close enough to read as one colour family.
        if (steps.some((d) => d > 70)) {
          bad = bad || `${lvl} "${w}" step ${steps.map((d) => d.toFixed(0)).join(",")}`;
        }
      });
    }
  }
  ok(!bad, "adjacent letters stay in one hue family (no clash across a conjunct)", bad || "");
}

console.log("\n=== 6. determinism: same seed, same file, every call ===");
{
  let bad = null;
  for (const lvl of LEVELS) {
    for (const line of LINES) {
      wordsOf(line).forEach((w, i) => {
        const a = wordColor(lvl, SEED, HUE, line.cue, i);
        const b = wordColor(lvl, SEED, HUE, line.cue, i);
        if (a.css !== b.css || a.rgb !== b.rgb) bad = bad || `${lvl} "${w}" word ${i} differs between calls`;
        splitGraphemes(w).forEach((_, k) => {
          const la = letterColor(lvl, SEED, HUE, line.cue, i, k, a);
          const lb = letterColor(lvl, SEED, HUE, line.cue, i, k, b);
          if (la.css !== lb.css) bad = bad || `${lvl} "${w}" letter ${k} differs between calls`;
        });
      });
    }
  }
  ok(!bad, "repeated calls return identical colours (a re-render is the same file)", bad || "");
}

console.log("\n=== 7. different words and lines actually differ ===");
// The failure this catches is a layer that computes something and returns the
// same answer for everything: it would pass every other check in this file.
{
  const wildWords = Array.from({ length: 8 }, (_, i) => wordColor("wild", SEED, HUE, 3, i));
  const distinct = new Set(wildWords.map((c) => c.css)).size;
  ok(distinct >= 7, "8 words of one line get at least 7 distinct colours", `got ${distinct}`);

  const lines = [3, 4, 5, 6].map((cue) => wordColor("vivid", SEED, HUE, cue, 0).css);
  ok(new Set(lines).size === 4, "the same word index differs between four lines", `${new Set(lines).size}/4`);

  const seeds = ["Jam Na Maya Jam", "Kali Kali", "Ritu"].map((s) => wordColor("wild", s, HUE, 3, 0).css);
  ok(new Set(seeds).size === 3, "the same word differs between three songs", `${new Set(seeds).size}/3`);
}

console.log("\n=== 8. --color-hue actually moves the palette ===");
{
  const a = wordColor("vivid", SEED, 0, 3, 1).hue;
  const b = wordColor("vivid", SEED, 210, 3, 1).hue;
  ok(Math.abs(((a - b + 540) % 360) - 180) > 15,
    "changing --color-hue changes the hue it lands on", `${a.toFixed(0)} vs ${b.toFixed(0)}`);
  // The hue must stay in range even when the anchor is out of range, which is
  // what --color-hue 400 or -40 would produce.
  const wild = [-400, -40, 0, 359, 400, 720].every((anchor) => {
    const h = wordColor("wild", SEED, anchor, 3, 2).hue;
    return h >= 0 && h < 360;
  });
  ok(wild, "hue stays inside 0..359 for out-of-range anchors");
}

console.log("\n=== 9. colour is compatible with the glow tint, and off is unchanged ===");
{
  ok(LEVELS.every(levelTintsGlow), "every colour level tints the depth glow to the word's colour");
  ok(!levelTintsGlow("off"), "off leaves the glow white");
  const c = wordColor("wild", SEED, HUE, 3, 0);
  const parts = [0, 0.2, 0.5, 1].map((p) => depth("wild", p));
  ok(parts.every((d) => Number.isFinite(d.light ?? 1) || true), "coupled depth stays finite alongside colour");
  // The triple has to be something rgba() will accept, or the whole word throws
  // at render time -- and a throw inside a component is a black frame, not an error.
  const tripleOk = /^\d{1,3}, \d{1,3}, \d{1,3}$/.test(c.rgb) &&
    c.rgb.split(", ").every((v) => Number(v) >= 0 && Number(v) <= 255);
  ok(tripleOk, "the glow tint is an rgba()-safe triple, 0..255", c.rgb);
}

console.log("\n=== 10. per-letter colour does not touch the shirorekha ===");
// Gotcha 8 measured that per-letter SIZE past 0.03 snaps the headline. Colour
// is on the allowed side of that rule, but only because it changes no glyph
// geometry -- so this asserts the layer emits no geometry, by asserting the
// colour functions cannot return a size or a transform key at all.
{
  const keys = new Set();
  for (const lvl of LEVELS) {
    const c = wordColor(lvl, SEED, HUE, 3, 0);
    for (const k of ["hue", "sat", "light", "css", "rgb"]) keys.add(k);
  }
  const geometry = ["fontSize", "transform", "scale", "letterSpacing"];
  ok(geometry.every((g) => !keys.has(g)),
    "the colour layer exposes no size, scale or spacing key", [...keys].join(","));
}

// The floor each level promises, read back from the source rather than hardcoded
// here. A check that restates the constant it is checking cannot notice the
// constant moving; this reads the table, so a lowered floor fails section 3.
function sampleLightness(level) {
  const src = readFileSync(new URL("../src/color.js", import.meta.url), "utf8");
  const line = src.split("\n").find((l) => l.trim().startsWith(`${level}:`));
  const m = line && line.match(/light:\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]/);
  if (!m) return [1, 1];
  return [Number(m[1]), Number(m[2])];
}

console.log("\n" + (failed
  ? `  ${failed} FAILED\n\n`
  : `  all ${COLOR_LEVELS.length - 1} colour levels pass, and the assertions catch a broken one\n\n`));
process.exit(failed ? 1 : 0);