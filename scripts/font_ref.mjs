// font_ref.mjs -- lyric-studio's entire interface to the font repository.
//
// WHY THIS FILE IS THE ONLY SEAM
// ------------------------------
// Two repositories, one direction of authority: nepali-legacy-fonts decides what
// a font IS and whether it WORKS, and this repository renders video. lyric-studio
// holds no font catalogue, no layout maps, no verdicts and no encoder of its own.
// It asks, and it obeys.
//
// That arrangement is not tidiness, it is the fix for three separate failures
// this pair of repositories had:
//
//   1. Two hand-synced copies of the verdict list, which disagreed. `abhinav`
//      was certified here as a verified legacy font on the strength of a clean
//      round-trip and full cmap coverage; it spells some words wrong. The font
//      repo's copy was updated first and this one kept serving the old answer.
//   2. Four PREETI fonts listed as "working" that had never been rendered once.
//      A round-trip proves the encoder and decoder agree. It cannot prove anyone
//      looked at the output.
//   3. An "11 working fonts" heading that had drifted while the data said 7, and
//      a "35 failed" total that could not be reconciled against a 42-font list.
//
// Each of those is the same shape: a fact written in one place, needed in
// another, with nothing asserting they still agree. The cure is not a better
// convention. It is one copy, in the place that owns the subject, read through
// a single function that fails loudly when the other repository is absent --
// rather than a cache that is silently stale when it is not.
//
// WHAT THIS DOES NOT DO
// ---------------------
// It does not decide whether a font is good. Nothing here can: only a rendered
// video watched by a human can, which is why verdicts.json has a `working`
// state no script may grant. This module reads verdicts; it does not write them.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// -- locating the font repository ---------------------------------------------

/**
 * Find the font repo, or explain how to place it.
 *
 * The test is not "the directory exists" but "the things we need are in it".
 * An early version checked only for `layouts/`, which meant a stale or partial
 * clone looked fine and then failed three steps later, at the point of no
 * return -- so a missing repository surfaced as a confusing encoder error rather
 * than as a missing repository. (gotcha 31's shape: the check passed, the
 * consumer still could not do its job.)
 */
export function findFontsRepo(explicit) {
  // fileURLToPath, not new URL(...).pathname. The pathname is percent-ENCODED,
  // so a repo living at "C:\Users\o0o\Documents\Default Project\lyric-studio"
  // resolved to "C:\Users\o0o\Documents\Default%20Project\..." and every
  // existence check below failed -- so findFontsRepo reported the perfectly good
  // font repository as "incomplete" and told the user to re-clone it.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, "..");
  const candidates = [
    explicit,
    process.env.FONTS_REPO,
    path.resolve(root, "..", "nepali-legacy-fonts"),
    path.resolve(root, "nepali-legacy-fonts"),
  ].filter(Boolean);

  // tools/ is where these repos live on this machine, but never hardcode a home
  // directory: fall back to the clone the user is most likely to have.
  const home = process.env.USERPROFILE || process.env.HOME || "";
  if (home) {
    candidates.push(path.join(home, "tools", "nepali-legacy-fonts"));
    candidates.push(path.join(home, "nepali-legacy-fonts"));
  }

  // What must exist for this repository to be able to render at all.
  const NEEDED = ["layouts", "verdicts.json", path.join("scripts", "lrc_legacy.py")];
  for (const c of candidates) {
    if (NEEDED.every((rel) => fs.existsSync(path.join(c, rel)))) return c;
  }
  // A directory that exists but is incomplete is worth naming, because "clone
  // the repo" is not the fix in that case and the message would send them there.
  for (const c of candidates) {
    if (fs.existsSync(c) && !NEEDED.every((rel) => fs.existsSync(path.join(c, rel)))) {
      const missing = NEEDED.filter((rel) => !fs.existsSync(path.join(c, rel)));
      throw new Error(
        "the font repository at " + c + " is incomplete.\n" +
        "  missing: " + missing.join(", ") + "\n" +
        "  Either finish the clone, or point at another with --fonts-repo <dir>."
      );
    }
  }
  return null;
}

/** Human-readable install instructions, including the "no font work needed" case. */
export const FONTS_REPO_HELP =
  "  This renderer keeps no fonts, layouts or verdicts of its own -- they live in\n" +
  "  nepali-legacy-fonts, and it is what decides whether a font is usable. A\n" +
  "  Unicode font needs none of that:\n" +
  "      node render.mjs <audio> <lrc> --font-file <path-to-a-unicode-ttf>\n" +
  "  For a legacy (Preeti) font, clone it as a sibling directory:\n" +
  "      git clone https://github.com/mhzsajan/nepali-legacy-fonts\n" +
  "      pip install npttf2utf          # required, not optional\n" +
  "  or point at it: --fonts-repo <dir>";

// -- reading verdicts ---------------------------------------------------------

let cache = null;

/**
 * The font repo's verdicts, as plain data. Cached per process, and the cache is
 * only ever a performance measure: `verdicts.json` is read at most once per run
 * and a render is a single run, so staleness across runs is not possible.
 */
export function loadVerdicts(repo) {
  if (cache) return cache;
  const file = path.join(repo, "verdicts.json");
  try {
    cache = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    // A malformed verdicts file must not be read as "no verdicts", because the
    // natural response to that is to render anyway. Fail here instead.
    throw new Error(
      "could not read " + file + "\n  " + err.message +
      "\n  Fix it in the font repo:  py scripts/check_verdicts.py"
    );
  }
  if (!cache || !Array.isArray(cache.handpicked) || typeof cache.verdicts !== "object") {
    throw new Error(file + " is not a verdicts file (expected `handpicked` and `verdicts`).");
  }
  return cache;
}

/** Drop the cache. Only for tests that swap repositories mid-process. */
export function resetVerdictCache() { cache = null; }

/**
 * The verdict for one slug, applying the repo's own bulk rules.
 *
 * The rules live in the font repo and are applied HERE, on purpose: duplicating
 * them would be the second copy this whole arrangement exists to eliminate. If
 * the font repo changes a rule, this picks it up with no edit on this side.
 */
export function verdictFor(repo, slug) {
  const v = loadVerdicts(repo);
  const row = v.verdicts && v.verdicts[slug];
  if (row && row.state) {
    return { slug, state: row.state, reason: row.reason || null, note: row.note || null,
             class: row.class || null, handpicked: v.handpicked.includes(slug) };
  }
  const bulk = v._bulk_verdicts || {};
  if (slug.startsWith("ams-") && bulk["ams-*"]) {
    return { slug, state: bulk["ams-*"].state, reason: bulk["ams-*"].reason || null,
             handpicked: v.handpicked.includes(slug) };
  }
  // `default` is the font repo's own answer for "no evidence either way".
  const d = bulk.default || { state: "untested" };
  return { slug, state: d.state, reason: d.reason || null, handpicked: v.handpicked.includes(slug) };
}

/** The four states, and what this renderer should do about each. */
export const FONT_RISK = {
  working:   { exit: false, say: null },
  untested:  { exit: false, say: "never rendered and never eye-checked -- untested is not a pass" },
  broken:    { exit: true,  say: null },
  failed:    { exit: true,  say: null },
};

/**
 * Check a font against the font repo before rendering with it.
 *
 * Returns { ok, verdict, message }. `ok === false` means the render should not
 * proceed in strict mode. Whether a non-`working` font is fatal is a POLICY
 * question and it is deliberately not decided here:
 *
 *   - strict (the default for a deliverable) refuses anything not `working`
 *   - non-strict warns loudly and renders, because font testing is exactly what
 *     the untested state is FOR, and a renderer that blocks it cannot be used to
 *     find out
 *
 * The one exception is a font that is *known* broken: it is refused in both
 * modes, because rendering it wastes six minutes to produce a file that is
 * already documented as spelling words wrong.
 */
export function checkFont(repo, slug, { strict = true } = {}) {
  const verdict = verdictFor(repo, slug);
  const risk = FONT_RISK[verdict.state] || FONT_RISK.untested;
  const knownBad = verdict.state === "broken" || verdict.state === "failed";
  const fatal = knownBad || (strict && verdict.state !== "working");
  return { ok: !fatal, verdict, knownBad, strict };
}

/** Print the font repo's four groups, by asking it rather than by reading its docs. */
export function printReport(repo) {
  const v = loadVerdicts(repo);
  const groups = new Map();
  const all = [...v.handpicked, ...Object.keys(v.verdicts || {})];
  for (const slug of new Set(all)) {
    const d = verdictFor(repo, slug);
    if (!groups.has(d.state)) groups.set(d.state, []);
    groups.get(d.state).push(d);
  }
  console.log("\n  FONT VERDICTS -- read live from " + path.join(repo, "verdicts.json"));
  console.log("  updated " + (v.updated || "?") + ", tested on " + (v.tested_song || "?") + "\n");
  for (const state of ["working", "broken", "untested", "failed"]) {
    const rows = groups.get(state) || [];
    if (!rows.length) continue;
    console.log("  " + state.toUpperCase() + " (" + rows.length + ")");
    for (const r of rows.sort((a, b) => a.slug.localeCompare(b.slug))) {
      const tag = [r.reason, r.handpicked ? "handpicked" : null].filter(Boolean).join(", ");
      console.log("      " + r.slug.padEnd(22) + (tag ? "  " + tag : ""));
    }
    console.log("");
  }
  console.log("  A font with no row is `untested` by definition. Absence of a failure is");
  console.log("  not a pass -- that is how four never-rendered fonts came to be listed as");
  console.log("  working, and how one that spells words wrong came to be certified.\n");
}

// -- calling into the font repo ------------------------------------------------

/** The Python that runs the font repo's tools, resolved the same way it is used. */
export function pythonBin() {
  if (process.env.PYTHON) return process.env.PYTHON;
  // Windows launcher first: `python` often does not exist at all on this box,
  // which is a bare ENOENT with no suggestion.
  for (const c of ["py", "python", "python3"]) {
    try {
      execFileSync(c, ["--version"], { stdio: "ignore" });
      return c;
    } catch { /* try the next one */ }
  }
  return "py";
}

/**
 * Run one of the font repo's scripts.
 *
 * `cwd` is the FONT repo, not this one, because those scripts resolve `layouts/`
 * and `sweep.json` relative to their own location. Getting this wrong produces
 * a silent fallback rather than an error, which is the reason it is set here
 * once instead of at each call site.
 */
export function fontRepoScript(repo, name, args) {
  return execFileSync(pythonBin(), [path.join(repo, "scripts", name), ...args], {
    stdio: "inherit",
    cwd: repo,
  });
}

/** The font repo's own path to a script, for messages that tell a human what to run. */
export function fontRepoScriptPath(repo, name) {
  return path.join(repo, "scripts", name);
}
