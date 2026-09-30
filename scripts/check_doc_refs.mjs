// check_doc_refs.mjs -- every script path the docs mention must exist.
//
// WHY THIS EXISTS
// ---------------
// Two real failures in this repo, both the same shape:
//
//   1. AGENTS.md lost `check_animation.mjs` from its check list and went on
//      saying "All five". The merge that did it was committed and pushed. A
//      front-door document that understates what exists is worse than no
//      document, because it is the thing a reader trusts first.
//   2. docs/GOTCHAS.md told a reader to run `scripts/passthrough.py` after that
//      file had been deleted as a stale duplicate of the font repo's copy.
//
// Both are the gotcha-31 family: a thing is written in one place, a consumer in
// another needs it, and nothing checks they still agree. Here the consumer is a
// person following a doc, so the check is "does this path exist".
//
// WHAT IT CHECKS
// --------------
//   - every `scripts/<name>.{py,mjs,js}` and `src/<name>.{js,jsx,mjs}` cited in
//     any tracked .md resolves, either in THIS repo or in the sibling font repo
//   - a repo is only allowed to cite a sibling-repo path if it says which repo
//   - the check list in AGENTS.md names the checks that actually exist
//
//   node scripts/check_doc_refs.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const FONT_REPO = path.join(ROOT, "..", "nepali-legacy-fonts");

let failed = 0;
const ok = (c, label, detail = "") => {
  console.log((c ? "  PASS  " : "  FAIL  ") + label + (detail ? "   " + detail : ""));
  if (!c) failed++;
};

const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
  .split("\n").filter(Boolean);
const docs = tracked.filter((f) => f.endsWith(".md"));

console.log("\n=== 1. every script path the INSTRUCTIONS cite exists ===");
{
  // Two documents are HISTORICAL RECORD rather than instructions, and a missing
  // path in them is expected rather than wrong:
  //
  //   docs/GOTCHAS.md  a post-mortem quotes the scratch file it used that day
  //                    ("`scripts/_probe40.mjs`-style") -- demanding it still
  //                    exist would mean keeping every probe forever.
  //   docs/FONTS.md    quotes a verbatim error string from a past failure
  //                    ("died with FileNotFoundError: ...\scripts\map.json").
  //
  // Both were real findings when this check first ran, and both were WRONG
  // findings: a quoted error is not an instruction to run anything. So the
  // distinction is made by document ROLE, which is a real property of these
  // files, rather than by guessing at each mention in prose. Historical
  // documents are reported; the front-door instructions are enforced.
  const HISTORICAL = new Set(["docs/GOTCHAS.md", "docs/FONTS.md"]);

  // The extension alternation MUST be longest-first. With `js` before `jsx`,
  // "LyricOverlay.jsx" matches as "...js" and the check reports a missing file
  // that exists; with `js` before `json`, "map.json" matches as "map.js". Both
  // happened on the first run of this check, which is the whole reason the
  // first run of a check is worth reading rather than trusting.
  const RE = /(?:nepali-legacy-fonts[\\/])?((?:scripts|src)[\\/][A-Za-z0-9_.-]+\.(?:jsx|mjs|json|py|js))(?![A-Za-z0-9])/g;

  const missing = [];
  const historical = [];
  let checked = 0;
  for (const d of docs) {
    const text = fs.readFileSync(path.join(ROOT, d), "utf8");
    for (const m of text.matchAll(RE)) {
      const full = m[0];
      const rel = m[1].replace(/\\/g, "/");
      const namesSiblings = /nepali-legacy-fonts/.test(full);
      const here = fs.existsSync(path.join(ROOT, rel));
      const there = fs.existsSync(path.join(FONT_REPO, rel));
      checked++;
      if (!here && !there) {
        (HISTORICAL.has(d) ? historical : missing).push(d + " -> " + full);
      } else if (!here && there && !namesSiblings) {
        // It is in the font repo but the doc does not say so, so a reader will
        // run it from this repo and get "not found". That IS worth failing --
        // in an instruction doc, and in a historical one it is still worth
        // knowing about.
        (HISTORICAL.has(d) ? historical : missing).push(
          d + " -> " + full + "  (lives in the font repo, but not named as such)");
      }
    }
  }
  ok(missing.length === 0, checked + " cited paths in instruction docs all resolve",
    missing.slice(0, 4).join(" | "));
  if (historical.length) {
    console.log("  note  " + historical.length + " cited in historical docs, and gone:");
    for (const h of historical.slice(0, 4)) console.log("          " + h);
    console.log("        expected: those documents record what was done, not what to run.");
  }
}

console.log("\n=== 2. the check list in AGENTS.md is not stale ===");
{
  // The failure this catches: a new check is added, the list is not updated, and
  // the count in the prose ("All five") goes on being wrong.
  //
  // Read the DIRECTORY, not `git ls-files`. The first version used git, which
  // cannot see a check you have created but not yet committed -- so the exact
  // moment this check exists to help with is the moment it is blind. A check
  // that is only correct on a clean tree is a check with a hole in the middle.
  //
  // Accept both `scripts/check_x.mjs` and a bare `` `check_x.mjs` `` in a table,
  // because the list is documentation, and documentation formats paths for
  // reading rather than for grepping.
  const agents = fs.readFileSync(path.join(ROOT, "AGENTS.md"), "utf8");
  // check_all.mjs is the RUNNER, not a check, and check_ends.py /
  // check_output.py / check_font_cmap.py are checks in their own right. The first
  // version of this counted only .mjs, so it compared "18" against 16 and
  // reported a mismatch that was really a gap in the counting.
  const isRunner = (n) => n === "check_all";
  const listed = new Set(
    [...agents.matchAll(/(?:scripts[\\/])?(check_[a-z_]+)\.(?:mjs|py)/g)]
      .map((m) => m[1]).filter((n) => !isRunner(n)));

  const onDisk = fs.readdirSync(path.join(ROOT, "scripts"))
    .map((f) => /^(check_.*)\.(?:mjs|py)$/.exec(f))
    .filter(Boolean).map((m) => m[1]).filter((n) => !isRunner(n));

  const unlisted = onDisk.filter((c) => !listed.has(c));
  ok(unlisted.length === 0,
    "every check on disk is named in AGENTS.md (" + onDisk.length + " found)",
    unlisted.join(", "));

  const ghost = [...listed].filter((c) => !onDisk.includes(c));
  ok(ghost.length === 0, "AGENTS.md names no check that does not exist", ghost.join(", "));

  // The prose count has to match the list. Last time it said "All five" while
  // the directory held fourteen, which is a front-door document understating
  // what the repo can check for.
  //
  // The count may be written as a digit or a word, and the first version only
  // understood words, so "There are **18** check scripts" compared undefined
  // against 18 and failed on a correct document.
  const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const asCount = (s) => (/^\d+$/.test(s) ? Number(s) : WORDS[s.toLowerCase()]);
  const m = /There are \*\*([\w]+)\*\* check scripts/.exec(agents)
    || /All (\w+) are seconds/.exec(agents);
  if (!m) {
    ok(false, "AGENTS.md states how many checks there are",
      "expected 'There are **N** check scripts' or 'All N are seconds'");
  } else {
    const claimed = asCount(m[1]);
    ok(claimed === listed.size,
      "the count in AGENTS.md matches the number of checks it names",
      "says " + (claimed === undefined ? m[1] : claimed) + ", names " + listed.size);
  }
}

// Return the real markdown headings of a document: their level and their text.
//
// Three things this has to get right, each of which was wrong on the first run
// and produced a confident nonsense answer rather than an error:
//
//   1. FENCES. A bash block containing "# 1. does the song's text survive..."
//    is a COMMENT, not an H1. Without tracking ``` the parser sees two extra
//    headings in FONTS-VERIFIED.md, both of them prose in a code block.
//   2. THE DOCUMENT TITLE IS NOT A SECTION. FONTS-VERIFIED.md's H1 is "Fonts:
//    what is actually verified, and how to check a new one" -- it contains
//    "verified", so a naive search matched it first and treated the WHOLE FILE
//    as the WORKING table. Only level >= 2 is a section.
//   3. WORK AND FAIL OVERLAP. RENDER-TESTED.md's failing table is headed
//    "NOT WORKING", which CONTAINS "working". A matcher for "working" therefore
//    finds the FAILED table too, and a matcher for "fail" finds it as well, so
//    both classifications claimed the same rows. They must be mutually
//    exclusive, which is stated in isWork / isFail below.
const headings = (text) => {
  const out = [];
  let fence = null;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const f = /^\s*(```+|~~~+)/.exec(line);
    if (f) { fence = fence === null ? f[1] : (line.trim().startsWith(fence) ? null : fence); continue; }
    if (fence !== null) continue;
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) out.push({ level: m[1].length, text: m[2], line: i });
  }
  return out;
};

// Mutually exclusive by construction: anything that reads as a failure is not a
// working table, however many of the words it also contains.
const NEGATIVE = /fail|not working|do not use|avoid|broken/i;
const isWork = (h) => h.level >= 2 && /working|verified|proven|pass/i.test(h.text) && !NEGATIVE.test(h.text);
const isFail = (h) => h.level >= 2 && NEGATIVE.test(h.text);

// The body of the section whose heading `classify` accepts first: from the line
// after that heading to the next heading of the same or higher level.
const sectionUnder = (text, classify) => {
  const lines = text.split(/\r?\n/);
  const all = headings(text);
  const at = all.findIndex(classify);
  if (at < 0) return null;
  const level = all[at].level;
  const out = [];
  for (let i = all[at].line + 1; i < lines.length; i++) {
    const m = /^(#{1,6})\s+/.exec(lines[i]);
    if (m && m[1].length <= level) break;
    out.push(lines[i]);
  }
  return out.join("\n");
};

// Every backticked slug-shaped token in a section.
//
// Not just table rows. The WORKING lists are tables, but the FAILED lists are
// PROSE -- bolded category headings with the slugs inline -- so a row scan found
// 0 failed fonts in both files and reported "no conflicts" from an empty set,
// which is the most dangerous kind of green. The token shape does the filtering:
// a font slug is [a-z0-9][a-z0-9-]*, which rejects the Devanagari examples
// (`saangai`), the raw-ASCII output (`hfpm,`), file names (`sweep.json`) and
// placeholders (`<slug>`) that share those sections.
const slugsInSection = (text, classify) => {
  const seg = sectionUnder(text, classify);
  if (seg === null) return null;
  const out = new Set();
  for (const m of seg.matchAll(/`([a-z0-9][a-z0-9-]*)`/g)) out.add(m[1]);
  return out;
};

console.log("\n=== 3. the two font-verdict files list the SAME working fonts ===");
{
  // A mirror pair, hand-synced, is a mirror pair that drifts -- and this exact
  // pair has already drifted once: abhinav was certified from a clean round-trip
  // and then marked failed by eye, in one file before the other.
  //
  // COUNT THE ROWS, do not scrape the prose. The first version of this check
  // regexed for "N fonts" in the text and reported 8 against 11, which looked
  // like real drift. It was not: FONTS-VERIFIED.md states no count in prose at
  // all (8 Preeti + 3 Unicode = 11, and RENDER-TESTED.md's heading says 11).
  // A number in a document and the contents of a document are different claims,
  // and only one of them is the data.
  const a = path.join(ROOT, "docs", "FONTS-VERIFIED.md");
  const b = path.join(FONT_REPO, "docs", "RENDER-TESTED.md");
  if (!fs.existsSync(b)) {
    console.log("  SKIP  sibling font repo not present at " + FONT_REPO);
  } else {
    const ta = fs.readFileSync(a, "utf8");
    const tb = fs.readFileSync(b, "utf8");
    const workA = slugsInSection(ta, isWork);
    const workB = slugsInSection(tb, isWork);

    ok(workA && workA.size > 0, "FONTS-VERIFIED.md has a readable WORKING table",
      workA ? workA.size + " fonts" : "no WORKING section heading found");
    ok(workB && workB.size > 0, "RENDER-TESTED.md has a readable WORKING table",
      workB ? workB.size + " fonts" : "no WORKING section heading found");

    if (workA && workB) {
      const onlyA = [...workA].filter((s) => !workB.has(s));
      const onlyB = [...workB].filter((s) => !workA.has(s));
      ok(onlyA.length === 0 && onlyB.length === 0,
        "the two WORKING tables list the same fonts",
        "only in FONTS-VERIFIED: " + (onlyA.join(", ") || "-") +
        " | only in RENDER-TESTED: " + (onlyB.join(", ") || "-"));
    }

    // The failure that motivated all of this. A font must never be WORKING in
    // one file and FAILED in the other, because whichever file a reader opens
    // is what decides what they render.
    const failA = slugsInSection(ta, isFail) || new Set();
    const failB = slugsInSection(tb, isFail) || new Set();
    const overlap = [...failA].filter((s) => workA && workA.has(s))
      .concat([...failB].filter((s) => workB && workB.has(s)));
    ok(overlap.length === 0,
      "no font appears in both a WORKING and a FAILED table",
      overlap.length ? overlap.join(", ") : "failed: " + failA.size + " + " + failB.size);

    const conflict = [...new Set([...failA].filter((s) => workB && workB.has(s))
      .concat([...failB].filter((s) => workA && workA.has(s))))];
    ok(conflict.length === 0, "no font is WORKING in one file and FAILED in the other",
      conflict.length ? conflict.join(", ") : "-");

    // The stated pass count must agree with the table it is describing.
    //
    // This is the check that matters most, and the one that is currently RED.
    // FONTS-VERIFIED.md says "7 of the 42 passed" and names those seven in
    // parentheses, while the WORKING table above it still lists eleven. Four
    // fonts -- ananda-lipi-bold-bt, himalayabold, katmandu, shreenath-bold --
    // are in the table, in neither the named seven nor the failed prose, and all
    // four are class=PREETI in sweep.json.
    //
    // It is deliberately NOT resolved here. "Delete the four" and "the four are
    // fine, fix the prose" are both defensible, and picking wrongly either
    // discards four working fonts or leaves four broken ones in the list people
    // actually render from. Only a person who has looked at the glyphs can say
    // which -- the abhinav lesson again: correct class, clean round-trip, full
    // cmap, and still spelling words wrong.
    const stated = /(\d+)\s+of\s+the\s+(\d+)\s+(?:handpicked\s+)?(?:passed|preferred|fonts)/i.exec(ta);
    // The names beside the count may be backticked or bare. Accept both, then
    // keep only tokens that are REAL slugs in sweep.json -- so a stray English
    // word in the parenthetical cannot be mistaken for a font, and a typo'd
    // name is visibly absent from the count rather than silently counted.
    const knownSlugs = (() => {
      try {
        const s = JSON.parse(fs.readFileSync(path.join(FONT_REPO, "sweep.json"), "utf8"));
        return new Set(s.map((e) => e.slug));
      } catch { return null; }
    })();
    const namedList = (() => {
      // "passed** (a, b, c)" -- the bold close sits between the word and the
      // paren, so the gap has to tolerate '**'.
      const m = /passed\s*\*{0,2}\s*\(([^)]*)\)/i.exec(ta);
      if (!m) return null;
      const toks = [...m[1].matchAll(/`?([a-z0-9][a-z0-9-]*)`?/g)].map((x) => x[1]);
      return knownSlugs ? new Set(toks.filter((t) => knownSlugs.has(t))) : new Set(toks);
    })();
    if (stated && namedList) {
      const claimed = Number(stated[1]);
      ok(claimed === namedList.size,
        "the stated pass count matches the list of fonts named beside it",
        "says " + claimed + ", names " + namedList.size);
      if (workA) {
        const extra = [...workA].filter((s) => !namedList.has(s));
        ok(extra.length === 0,
          "the WORKING table contains exactly the fonts stated as passing",
          extra.length
            ? "in the table but not in the stated " + claimed + ": " + extra.join(", ")
            : "table and prose agree");
      }
    } else {
      console.log("  note  no 'N of the M passed (...)' sentence found to cross-check the table");
    }
  }
}

console.log(failed ? "\n  " + failed + " CHECK(S) FAILED\n" : "\n  all doc-reference checks passed\n");
process.exit(failed ? 1 : 0);
