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

  // A "ghost" is a name that exists NOWHERE. It used to mean "not in this repo's
  // scripts/", which stopped being true when the font repo took ownership of the
  // font facts and two checks moved there: AGENTS.md names them, correctly
  // attributed, and this reported them as checks that do not exist -- a false
  // failure, which is the kind that gets silenced by deleting the honest
  // sentence rather than by fixing the check.
  //
  // So a name that exists in the SIBLING repo is not a ghost. What must still
  // fail is a name in neither repo, and that is what this catches.
  const fontRepoChecks = fs.existsSync(path.join(FONT_REPO, "scripts"))
    ? fs.readdirSync(path.join(FONT_REPO, "scripts"))
        .map((f) => /^(check_.*)\.(?:mjs|py)$/.exec(f))
        .filter(Boolean).map((m) => m[1])
    : [];
  const ghost = [...listed].filter(
    (c) => !onDisk.includes(c) && !fontRepoChecks.includes(c));
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
//    headings, both of them prose in a code block.
//   2. THE DOCUMENT TITLE IS NOT A SECTION. A title like "Fonts: what is
//    verified" contains "verified", so a naive search matched it first and
//    treated the WHOLE FILE as a section. Only level >= 2 is a section.
//
// The WORKING/FAILED classifiers that used to sit below this parser are GONE,
// and their absence is the point: they existed to split two font-verdict tables
// across two repos, and there is no pair to split any more -- the font repo owns
// one verdicts.json. They are left out rather than left in, because a check
// helper with no caller is a second answer to a question nobody is asking, and
// the next person to edit this file would reasonably assume it still meant
// something.
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

console.log("\n=== 3. this repo holds NO font verdicts of its own ===");
{
  // WHAT REPLACED WHAT, and why this is not a loss of coverage.
  //
  // This section used to cross-check a MIRROR PAIR: docs/FONTS-VERIFIED.md here
  // against docs/RENDER-TESTED.md in the font repo, because both listed which
  // fonts worked. A mirror pair is a second thing to be wrong, and it had already
  // drifted once -- abhinav was certified from a clean round-trip in one file and
  // marked failed by eye in the other, which is how a font ended up "working" and
  // broken at the same time.
  //
  // The font repo then took sole ownership: ONE authority, verdicts.json, four
  // states, checked by the font repo's own scripts/check_verdicts.py. There is no
  // pair left to cross-check, and pretending otherwise is worse than useless:
  // FONTS-VERIFIED.md was deleted, AGENTS.md still pointed at it, and this section
  // threw ENOENT on every run. A check that crashes is a check nobody runs, and
  // the failure it was watching for is still real.
  //
  // So the drift is now watched from the other side. The invariant that replaces
  // it is the one the split was made for: if a font verdict reappears in THIS
  // repo, it is already a second copy that can disagree with the authority,
  // whether or not it happens to agree today.

  const here = path.join(ROOT, "docs", "FONTS-VERIFIED.md");
  ok(!fs.existsSync(here), "the deleted mirror doc has not come back", "docs/FONTS-VERIFIED.md");

  // No second store. The authority is a JSON file in the other repo, and a second
  // one here is the drift this section used to chase, one level down.
  const strayStores = fs.existsSync(path.join(ROOT, "docs"))
    ? fs.readdirSync(path.join(ROOT, "docs")).filter((f) => /verdict/i.test(f))
    : [];
  ok(strayStores.length === 0,
    "no verdict store has been added to docs/ here", strayStores.join(", ") || "none");

  // A doc may NAME font files -- --font-file paths, family names, the font repo
  // itself. That is usage. What it may not do is CLAIM which fonts work, and a
  // claim lives in a HEADING, so this reads headings rather than prose.
  //
  // Headings, not whole-file matching: the first attempt at this matched anywhere
  // in the text and immediately reported four files, every one of them for the
  // word "verdict" used correctly to say the repo does NOT hold verdicts. A check
  // that fires on its own explanation is a check that trains you to ignore it.
  //
  // knowledge-repo-archive/ is excluded because it is a verbatim archive of a
  // DELETED repo, kept for the font forensics and explicitly not to be edited.
  const claim = /verdict|working\s+fonts?\b|fonts?\s+that\s+work|not\s+working|broken\s+fonts?/i;
  const offenders = [];
  for (const d of docs) {
    if (d.startsWith("docs/knowledge-repo-archive/")) continue;
    for (const h of headings(fs.readFileSync(path.join(ROOT, d), "utf8"))) {
      if (h.level >= 2 && claim.test(h.text)) offenders.push(d + " -> " + h.text);
    }
  }
  ok(offenders.length === 0,
    "no section heading in this repo claims a font verdict",
    offenders.join(" | ") || "none");

  // The authority must actually be reachable and readable, or "we hold no
  // verdicts" is just a tidier way of holding none at all.
  if (!fs.existsSync(FONT_REPO)) {
    console.log("  SKIP  sibling font repo not present at " + FONT_REPO);
  } else {
    const authority = path.join(FONT_REPO, "verdicts.json");
    ok(fs.existsSync(authority), "the font repo's verdicts.json is reachable", "the one authority");
    if (fs.existsSync(authority)) {
      let states = null;
      let fonts = null;
      try {
        const v = JSON.parse(fs.readFileSync(authority, "utf8"));
        // Read the structure rather than flattening it. The first attempt took
        // every value in the file and reported "working, arya, broken,
        // 2026-09-30, 35 lines" as a list of states -- which is a green that
        // proves nothing, the exact shape this repo has been bitten by before.
        states = Array.isArray(v._states) ? v._states.slice().sort() : null;
        fonts = Object.keys(v.verdicts || {}).length;
      } catch { states = null; }
      ok(!!states && states.length === 4,
        "verdicts.json parses and declares its four states",
        states ? states.join(", ") : "unreadable or no _states");
      ok(fonts > 0, "verdicts.json actually carries per-font verdicts", fonts + " fonts");
    }
  }
}
console.log(failed ? "\n  " + failed + " CHECK(S) FAILED\n" : "\n  all doc-reference checks passed\n");
process.exit(failed ? 1 : 0);
