// check_title.mjs -- the title-word highlight must fire on the title and only on it.
//
//   node scripts\check_title.mjs
//
// WHY A WHOLE SUITE FOR ONE FEATURE
// ---------------------------------
// A highlight that fires on the wrong word is worse than no highlight: it tells the
// audience that word matters, and it does not. Every assertion here is a way that
// could go wrong, and the punctuation one is the one that bites first -- a title
// that carries a comma it strips and a lyric that does not will silently match
// nothing, and a feature that matches nothing looks exactly like a feature that has
// not been implemented yet.
//
// THE MOST IMPORTANT ASSERTION IS THE NEGATIVE ONE
// ------------------------------------------------
// That a NON-title word is not marked. It is easy to write a test that only proves
// the feature fires; that is satisfied by `() => true`. The test that has value is
// the one that would fail if the matcher were too loose, because too loose is the
// direction that reaches the screen.
let failed = 0;
const ok = (c, label, detail = "") => {
  console.log((c ? "  PASS  " : "  FAIL  ") + label + (detail ? "   " + detail : ""));
  if (!c) failed++;
};

const {
  normToken, titleTokens, titleWordFlags, titleStyle, hasTitleWord,
} = await import("../src/title.js");

// The real titles from the real songs, punctuation and all.
const ALLARE = "अल्लारे,";
const TIMILAI = "तिमीलाई भुलेको,";
const RITU = "ऋतु";

console.log("\n=== 1. the title's own words, with punctuation stripped ===");
{
  ok(normToken("अल्लारे,") === "अल्लारे", "a trailing comma is stripped",
    JSON.stringify(normToken("अल्लारे,")));
  ok(normToken("तिमीलाई भुलेको,") === "तिमीलाई भुलेको",
    "a comma inside the title is stripped");
  ok(titleTokens(TIMILAI).length === 2, "a two-word title is two tokens",
    titleTokens(TIMILAI).join(" | "));
  ok(titleTokens("").length === 0, "an empty title has no tokens");
  ok(titleTokens(null).length === 0, "a MISSING title has no tokens, and does not throw");
}

console.log("\n=== 2. it fires on the title word, every time it appears ===");
{
  // Allare's refrain. The title word is the whole line, repeatedly.
  const line = "अल्लारे अल्लारे, अल्लारे नै हो";
  const f = titleWordFlags(line, ALLARE);
  ok(f.length === 5, "one flag per word", f.length + " words");
  ok(f.filter(Boolean).length === 3, "all THREE occurrences are marked",
    f.filter(Boolean).length + " of 3");
  // Indices 0, 1 and 2. The first version of this asserted f[3], which is "नै" --
  // a word of the LINE, not of the title. It failed, and the failure was the test's
  // arithmetic rather than the matcher, which is the usual ratio for a new
  // assertion and the reason the count assertion above it is the load-bearing one.
  ok(f[0] === true && f[1] === true && f[2] === true,
    "and they are the right three -- indices 0, 1, 2");
  ok(f[3] === false && f[4] === false,
    "while the line's own words are not marked");
  ok(hasTitleWord(line, ALLARE), "hasTitleWord agrees");

  // A title word inside a longer line, with the lyric's own punctuation differing
  // from the title's -- the case that silently matches nothing.
  const mixed = "हो.. अल्लारे म त हाला संगो आउँछु,";
  const g = titleWordFlags(mixed, ALLARE);
  // Seven words: हो.. / अल्लारे / म / त / हाला / संगो / आउँछु,
  // The first version asserted 8. A count assertion is only worth having if the
  // count is derived rather than guessed, so it is spelled out here.
  ok(g.length === 7, "the mixed line is split into words", g.length + " of 7");
  ok(g[1] === true, "and the title word inside it is found",
    "word 1 of: " + mixed);
  ok(g.filter(Boolean).length === 1, "exactly one, not the whole line");
}

console.log("\n=== 3. and on NOTHING else -- the assertion that has value ===");
{
  // Words that merely RESEMBLE the title must not be marked. If the matcher were a
  // substring test, every one of these would light up.
  const cases = [
    ["अल्लारेलाई", ALLARE, "a longer word that CONTAINS the title word"],
    ["हो अल्लारे", "तिमीलाई भुलेको,", "a line with a different song's title absent"],
    ["तिमीलाई", TIMILAI, "one word of a two-word title, alone"],
    ["मायालु", ALLARE, "an unrelated word"],
    ["सबै कुरा", ALLARE, "an unrelated line"],
  ];
  let bad = null;
  for (const [text, title, why] of cases) {
    const f = titleWordFlags(text, title);
    const hit = f.some(Boolean);
    if (hit && why.indexOf("one word of a two-word title") === -1) {
      bad = bad + ` ${JSON.stringify(text)} -- ${why}`;
    }
  }
  ok(!bad, "no word is marked unless it IS a whole title word",
    bad || `${cases.length} near-miss cases, none marked`);

  // The one that SHOULD match: a single word of a two-word title, on its own.
  ok(titleWordFlags("तिमीलाई", TIMILAI)[0] === true,
    "but one word of a two-word title DOES match on its own",
    "a word of the title is still a title word");

  // And a whole word that is a substring in the other direction.
  ok(!titleWordFlags("लारे", ALLARE)[0],
    "a SUFFIX of the title word is not marked");
}

console.log("\n=== 4. both scripts, because the request said 'nepali or english' ===");
{
  const f = titleWordFlags("Allare Allare, Allare ho", "Allare,");
  ok(f.filter(Boolean).length === 3, "an English title matches its English words",
    f.filter(Boolean).length + " of 3");
  ok(titleWordFlags("allare", "Allare")[0] === true,
    "case does not matter for Latin");
  // Passing both scripts at once, so a lyric in either script finds its title.
  const both = titleWordFlags("Allare र अल्लारे", [ALLARE, "Allare"]);
  ok(both.filter(Boolean).length === 2, "both scripts can be supplied together",
    both.join(","));
}

console.log("\n=== 5. it is PAINT, not geometry -- the matra rule ===");
// Every bug this project lost a day to was a per-syllable TRANSFORM: a scale, a
// lift, a clip, a rotate relative to a letter's neighbours. Devanagari's shirorekha
// is continuous across a word, so moving one syllable detaches a matra and the word
// becomes a different word.
{
  const s = titleStyle("hsl(0, 92%, 62%)");
  const keys = Object.keys(s);
  ok(keys.indexOf("textShadow") >= 0, "the glow is a text-shadow, which cannot move a glyph");
  ok(keys.indexOf("filter") < 0, "no filter: a filter: glow() is the road back to the matra bug");
  ok(keys.indexOf("transform") < 0, "no transform of any kind");
  // The one geometric property it does set is a per-WORD font-size, and it is safe
  // only because it is a whole word -- so assert it is a percentage, not a
  // per-syllable value.
  ok(/^\d+\.\d%$/.test(s.fontSize), "the size is a whole-word percentage",
    s.fontSize);
  ok(parseFloat(s.fontSize) > 100, "and it is a bump, not a reduction",
    s.fontSize);
  ok(s.display === "inline-block",
    "inline-block, so the enlarged word cannot be clipped by its row");
}

console.log("\n=== 6. determinism, and no frame time ===");
// Same input, same answer, every render. A highlight that moved between renders
// would not be the same song twice.
{
  const a = titleWordFlags("हो.. अल्लारे म त", ALLARE);
  const b = titleWordFlags("हो.. अल्लारे म त", ALLARE);
  ok(JSON.stringify(a) === JSON.stringify(b), "same input, same flags");
  let varies = false;
  for (let i = 0; i < 30; i++) {
    if (JSON.stringify(titleWordFlags("हो.. अल्लारे म त", ALLARE)) !== JSON.stringify(a)) {
      varies = true;
    }
  }
  ok(!varies, "and it does not vary across repeated calls");
  // The signature must not take a frame time. A highlight that could delay a word
  // pushes ink past the cue's end, which is the worst bug in this project.
  const src = String(titleWordFlags) + String(titleStyle) + String(hasTitleWord);
  ok(!/\bframe\b|\btime\b|\bframeIndex\b/.test(src),
    "no function takes a frame time, so it cannot delay a word");
}

console.log("\n" + (failed
  ? `  ${failed} FAILED\n\n`
  : `  the title word is found exactly, marked every time, and marked with paint only\n\n`));
process.exit(failed ? 1 : 0);
