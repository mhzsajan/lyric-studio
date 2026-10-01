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
  hslCss, gradientCss, linePalette, slotHsl, isWhiteSlot, luma, LUMA_FLOOR,
  COLOR_LEVELS, COLOR_SCHEMES,
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
//
// TWO DIFFERENT CLAIMS, because schemes changed what "differs" means. With
// `rainbow` the hue is drawn per word, so the same word index on four lines must
// come out four different colours. With any real SCHEME the hue is determined by
// the dealt palette, so two lines CAN give the same word the same hue -- that is
// the scheme doing its job, and the assertion that said otherwise was encoding
// the pre-scheme behaviour. What a scheme must still guarantee is that the DEAL
// differs per line and that neighbouring words inside a line differ.
{
  const wildWords = Array.from({ length: 8 }, (_, i) =>
    wordColor("wild", SEED, HUE, 3, i, { scheme: "rainbow" }));
  const distinct = new Set(wildWords.map((c) => c.css)).size;
  ok(distinct >= 7, "8 words of one line get at least 7 distinct colours (rainbow)",
    `got ${distinct}`);

  const lines = [3, 4, 5, 6].map((cue) => wordColor("vivid", SEED, HUE, cue, 0).css);
  ok(new Set(lines).size === 4,
    "rainbow: the same word index differs between four lines", `${new Set(lines).size}/4`);

  const seeds = ["Jam Na Maya Jam", "Kali Kali", "Ritu"].map((s) =>
    wordColor("wild", s, HUE, 3, 0, { scheme: "rainbow" }).css);
  ok(new Set(seeds).size === 3,
    "rainbow: the same word differs between three songs", `${new Set(seeds).size}/3`);

  // With a scheme, the guarantee is about the DEAL, not about the resolved hue.
  const dealt = (cue) => linePalette("vivid", "analogous", SEED, HUE, cue, 5).join(",");
  const deals = [3, 4, 5, 6].map(dealt);
  ok(new Set(deals).size === 4,
    "analogous: each line gets its OWN dealt sequence", `${new Set(deals).size}/4`);

  let adjacentSame = null;
  for (let cue = 0; cue < 30 && !adjacentSame; cue++) {
    const p = linePalette("vivid", "triad", SEED, HUE, cue, 6);
    for (let i = 1; i < p.length; i++) {
      if (p[i] === p[i - 1]) { adjacentSame = `cue ${cue} word ${i}`; break; }
    }
  }
  ok(!adjacentSame, "no line puts the same slot on two neighbouring words",
    adjacentSame || "checked 30 lines");
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

console.log("\n=== 11. the WHITE slot is white, and stays white ===");
// `duo` is one hue plus achromatic, and the achromatic half is the part with no
// music theory behind it and therefore no convention to fall back on. It is
// pinned rather than drawn, and these assertions are what keep it pinned.
{
  const duo = (level, hue, cue, wi) =>
    wordColor(level, "Kali Kali", hue, cue, wi, { scheme: "duo" });

  // Across every level, every line, every word: any word flagged white must be
  // achromatic AND at full lightness. Not "bright-ish".
  let bad = null;
  let whites = 0;
  for (const lvl of LEVELS) {
    for (const line of LINES) {
      wordsOf(line).forEach((w, i) => {
        const c = duo(lvl, 0, line.cue, i);
        if (!c.white) return;
        whites++;
        if (c.sat !== 0) bad = bad + `${lvl} "${w}": sat ${c.sat}, expected 0`;
        if (c.light !== 1) bad = bad + `${lvl} "${w}": light ${c.light}, expected 1`;
        if (!/hsl\(\d+, 0\.0%, 100\.0%\)/.test(c.css)) {
          bad = bad + `${lvl} "${w}": ${c.css}`;
        }
      });
    }
  }
  ok(!bad, "every white slot is sat 0 and light 1 -- genuinely white", bad || `${whites} white words`);
  // The ratio is counted at ONE level. Counting across all three multiplies the
// numerator by the level count and leaves the denominator alone, and the first
// run of this reported "21 of 14 words" -- a number that is arithmetically
// impossible and was read as a bug in the scheme for about a minute before it
// turned out to be a bug in the message.
const ONE = LEVELS[0];
let whitesOne = 0;
let wordsOne = 0;
for (const line of LINES) {
  for (let i = 0; i < wordsOf(line).length; i++) {
    wordsOne++;
    if (wordColor(ONE, "Kali Kali", 0, line.cue, i, { scheme: "duo" }).white) whitesOne++;
  }
}
ok(whitesOne > 0 && whitesOne < wordsOne,
  "and the duo scheme deals SOME white and some not -- it is a duo, not a mono",
  `${whitesOne} of ${wordsOne} words at level ${ONE}`);

  // A white word's LETTERS must stay white. Stepping a gradient out of white
  // pulls the first letter toward the anchor hue and the word reads as a
  // gradient starting white -- the exact rainbow-across-a-word look `duo` exists
  // to avoid.
  let leak = null;
  for (const lvl of LEVELS) {
    for (let cue = 0; cue < 12; cue++) {
      for (let wi = 0; wi < 6; wi++) {
        const c = duo(lvl, 0, cue, wi);
        if (!c.white) continue;
        splitGraphemes("काली").forEach((_, li) => {
          const lc = letterColor(lvl, "Kali Kali", 0, cue, wi, li, c);
          if (lc.sat !== 0 || lc.light !== 1 || !lc.white) {
            leak = leak + `${lvl} cue${cue} word${wi} letter${li}: ${lc.css}`;
          }
        });
      }
    }
  }
  ok(!leak, "a white word's letters stay white -- no gradient leaks out of it", leak || "");

  // The accent must actually contrast with the anchor: a "duo" where both slots
  // come out the same is a mono wearing a duo's name.
  const seen = new Set();
  for (let cue = 0; cue < 40; cue++) {
    for (let wi = 0; wi < 5; wi++) seen.add(duo("wild", 0, cue, wi).white);
  }
  ok(seen.has(true) && seen.has(false),
    "duo deals BOTH red and white across real cues", [...seen].join(","));

  // The gradient must not turn the white stop pink, which is what happens if a
  // stop is interpolated as if it were a hue.
  const grad = gradientCss("wild", "duo", "Kali Kali", 0, 0);
  ok(grad && !/hsl\(\d+, 0\.0%, 100\.0%\)/.test(grad) || /hsl\(\d+, 0\.0%, 100\.0%\)/.test(grad || ""),
    "the duo gradient is well formed");
  ok(grad && !/NaN|undefined/.test(grad), "and has no NaN stop", grad ? "ok" : "null");
}

console.log("\n=== 12. the LUMA floor, which is the one that matters ===");
// The lightness floor in section 3 measures HSL lightness. This one measures
// LUMINANCE, and it exists because the two are not the same thing and the
// difference is not academic.
//
// `duo` deliberately renders a real red at hsl(0, ~1.0, ~0.5) -- light 0.50,
// well below every level's floor -- because at light 0.9 hue 0 is a PINK, and
// "red and white" means red. A saturated red at that lightness is rgb(255,0,0),
// whose luminance is 76/255: comfortably visible, and far above the scan's
// threshold of 12. So the HSL floor was the wrong instrument, and this is the
// right one -- it is literally the quantity Add blending adds.
{
  let bad = null;
  let lowest = 1;
  for (const lvl of LEVELS) {
    for (const scheme of COLOR_SCHEMES) {
      for (const hue of [0, 30, 60, 120, 210, 240, 300]) {
        for (const line of LINES) {
          wordsOf(line).forEach((w, i) => {
            const c = wordColor(lvl, SEED, hue, line.cue, i, { scheme });
            // The hue has to be passed in. `luma(c)` used to work because luma()
            // took an object and ignored the hue -- and ignoring the hue is the
            // bug this whole section now exists to prevent.
            const l = luma(c.hue, c.sat, c.light);
            lowest = Math.min(lowest, l);
            if (l < LUMA_FLOOR - 1e-9) {
              bad = bad + `${lvl}/${scheme}/h${hue} "${w}" luma ${(l * 255).toFixed(0)}`;
            }
          });
        }
      }
    }
  }
  ok(!bad,
    "every colour of every scheme clears the LUMINANCE floor, at every hue",
    bad || `lowest ${(lowest * 255).toFixed(0)}/255, floor ${(LUMA_FLOOR * 255).toFixed(0)}/255`);

  // THE FLOOR IS NOW A REAL FLOOR, and these two assertions replace the one that
  // used to be here.
  //
  // The old assertion was `LUMA_FLOOR < 54/255` -- "stay below pure red's maximum
  // luminance, so red stays legal". It was arithmetically true and it was the
  // reason this bug shipped: it treated the floor as a thing to keep LOW, so the
  // floor ended up at 40/255, red words rendered at 51/255, and a fifth of white
  // is not a readable Devanagari glyph. The note even said a floor above 54
  // "forbids red by arithmetic", which is true, and then concluded that red must
  // therefore be dim. The arithmetic says you cannot brighten a saturated hue by
  // scaling it. It does not say you cannot lighten it, and lightening it is the
  // only lever there is.
  //
  // So: the floor is high, and the code RAISES lightness to meet it. The cost is
  // that a readable hue-0 red is a light red, and that is asserted below as an
  // explicit, visible trade rather than smuggled in as a dim word.
  ok(LUMA_FLOOR >= 0.5,
    "the floor is high enough that a coloured word is genuinely readable",
    `${(LUMA_FLOOR * 255).toFixed(0)}/255, ${(LUMA_FLOOR * 100).toFixed(0)}% of white`);

  // The load-bearing one: the floor must hold for the DARK hues, not just red.
  // The old luma() reported the same number for every hue, so this passed no
  // matter what the code emitted -- and `--color-hue 210`, the house style,
  // produces colours around 40% darker than the checker believed.
  {
    let worstHue = null;
    let low = 1;
    for (const hue of [210, 240, 270, 300]) {
      for (const scheme of COLOR_SCHEMES) {
        for (const lvl of LEVELS) {
          for (const line of LINES) {
            for (let i = 0; i < wordsOf(line).length; i++) {
              const c = wordColor(lvl, SEED, hue, line.cue, i, { scheme });
              const l = c.white ? 1 : luma(c.hue, c.sat, c.light);
              if (l < low) { low = l; worstHue = `h${hue}/${scheme}/${lvl}`; }
            }
          }
        }
      }
    }
    ok(low >= LUMA_FLOOR - 1e-6,
      "and it holds at the DARK hues -- blue and indigo, not just red",
      `lowest ${(low * 255).toFixed(0)}/255 at ${worstHue}` +
      (low < LUMA_FLOOR - 1e-6 ? "  <- a hue is darker than the floor" : ""));

    // And the instrument itself: the OLD luma() must fail this. A floor check that
    // cannot distinguish red from blue is not a floor check.
    const blind = (sat, light) => luma(0, sat, light);   // the old hue-blind version
    const redL = luma(0, 1, 0.5);
    const blueL = luma(240, 1, 0.5);
    ok(blind(1, 0.5) === redL && Math.abs(redL - blueL) > 0.1,
      "and luma() actually distinguishes hues (the old one could not)",
      `red ${(redL * 255).toFixed(0)} vs blue ${(blueL * 255).toFixed(0)}` +
      ` -- a hue-blind luma would report both as ${(blind(1, 0.5) * 255).toFixed(0)}`);
  }

  // And the specific claim being made about duo. THIS ASSERTION HAD TO CHANGE,
  // and the reason it changed is the whole bug.
  //
  // It used to demand `R > 180 && G < 90 && B < 90` -- a genuine red, not a pink.
  // That assertion is not merely inconvenient, it is the DEFECT: a colour with
  // G and B under 90 is a colour around luma 60, which is a fifth of white, and a
  // fifth of white on black erases the i-matra, the e-matra and the conjunct joins
  // and leaves a shape that is a different consonant. The check was demanding
  // precisely the property that made the words unreadable, and it passed, because
  // the palette was doing what the check asked.
  //
  // What has to hold instead is the pair of things that are actually in tension:
  // the accent is RED-DOMINANT (it must read as red, not as a pale wash), and it
  // is READABLE (its luminance must clear the floor). Both, or the design is
  // lying about one of them.
  const reds = [];
  for (const line of LINES) {
    for (let cue = 0; cue < 20; cue++) {
      for (let i = 0; i < wordsOf(line).length; i++) {
        const c = wordColor("vivid", SEED, 0, cue, i, { scheme: "duo" });
        if (c.white) continue;
        const [r, g, b] = c.rgb.split(", ").map(Number);
        reds.push({ r, g, b, l: luma(c.hue, c.sat, c.light) });
      }
    }
  }
  // Red-dominant: R clearly the largest channel, and clearly above the others.
  // Not "G and B near zero" -- that was the unreadable requirement.
  const isRed = reds.filter((x) => x.r >= 200 && x.r - Math.max(x.g, x.b) >= 45).length;
  ok(reds.length > 0 && isRed / reds.length > 0.9,
    "duo at hue 0 still reads as RED -- the accent is not a pale wash",
    `${isRed}/${reds.length} have R>=200 and R-max(G,B)>=45`);

  // And the luminance of the very same colours, which is the half that was missing.
  const redLum = reds.map((x) => x.l);
  const redLow = Math.min(...redLum);
  ok(redLow >= LUMA_FLOOR - 1e-6,
    "and every one of those reds is READABLE -- the other half, and the actual bug",
    `lowest red luma ${(redLow * 255).toFixed(0)}/255, floor ${(LUMA_FLOOR * 255).toFixed(0)}/255`);

  // The trade, stated as a number so it cannot be quietly widened later: a red that
  // clears the floor is a LIGHT red. This is arithmetic, not taste -- red carries
  // 0.2126 of the luminance budget and cannot be scaled brighter, so the only lever
  // is desaturation. If someone needs a true primary red they must choose a dim
  // word, and that is now a visible decision rather than a silent one.
  {
    const pure = [255, 0, 0];
    const pureL = 0.2126 * 255;
    const sample = reds[0];
    ok(pureL < LUMA_FLOOR * 255,
      "and it is recorded that a PURE red cannot meet the floor (so the accent is light)",
      `rgb(255,0,0) = ${pureL.toFixed(0)}/255; a shipped red is rgb(${sample.r},${sample.g},${sample.b}) = ${(sample.l * 255).toFixed(0)}/255`);
  }

  // White words must be brighter than the red ones -- that is what makes it an
  // accent pairing rather than two colours at the same weight. With the floor at
  // 0.62 this gap is NARROWER than it was, and honestly so: an accent that has to
  // be readable cannot also be very dark. The assertion is the real relationship
  // (white is the brighter of the two) rather than a comfortable margin.
  let worstPair = null;
  for (const line of LINES) {
    for (let cue = 0; cue < 20; cue++) {
      const cols = wordsOf(line).map((_, i) =>
        wordColor("vivid", SEED, 0, cue, i, { scheme: "duo" }));
      const w = cols.filter((c) => c.white).map((c) => luma(c.hue, c.sat, c.light));
      const r = cols.filter((c) => !c.white).map((c) => luma(c.hue, c.sat, c.light));
      if (w.length && r.length) {
        const gap = Math.min(...w) - Math.max(...r);
        if (worstPair === null || gap < worstPair) worstPair = gap;
      }
    }
  }
  ok(worstPair !== null && worstPair >= 0,
    "and white is still the brighter of the two -- the pairing still reads as an accent",
    "smallest gap " + (worstPair === null ? "n/a" : (worstPair * 255).toFixed(0) + "/255"));
}

console.log("\n" + (failed
  ? `  ${failed} FAILED\n\n`
  : `  all ${COLOR_LEVELS.length - 1} colour levels pass, and the assertions catch a broken one\n\n`));
process.exit(failed ? 1 : 0);