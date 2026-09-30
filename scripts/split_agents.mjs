// split_agents.mjs -- one-time restructure of AGENTS.md into navigable files.
//
// AGENTS.md had grown to ~1090 lines, of which ~730 were the gotcha history.
// That is the wrong shape for an orientation file: an agent (or a person) reads
// the top, finds no commands, and wades. So:
//
//   docs/GOTCHAS.md   every gotcha, NUMBERS PRESERVED, grouped, with an index
//   docs/ANIMATION.md every motion layer in one place with recipes
//   AGENTS.md         slim: what it is, the commands, the invariants, the map
//
// The numbers are load-bearing. Code comments across src/ and scripts/ cite
// "gotcha 31" and friends, so renumbering would silently break those trails and
// there is no way to grep for prose that used to be an anchor. This script
// therefore MOVES text and never renumbers it.
//
//   node scripts/split_agents.mjs [--dry]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const AG = path.join(ROOT, "AGENTS.md");
const DRY = process.argv.includes("--dry");

const src = fs.readFileSync(AG, "utf8");
const lines = src.split(/\r?\n/);

const at = (re) => {
  const i = lines.findIndex((l) => re.test(l));
  return i < 0 ? null : i;
};
const gotchasStart = at(/^## Gotchas that cost us time/);
const gotchasEnd = at(/^## The shape of the roam audio bug/);
if (gotchasStart === null || gotchasEnd === null) {
  console.error("  could not find the gotchas section boundaries -- refusing to guess");
  process.exit(1);
}

const gotchaBody = lines.slice(gotchasStart, gotchasEnd).join("\n");
const before = lines.slice(0, gotchasStart);
const after = lines.slice(gotchasEnd);

// Index built from the actual headings, so it cannot drift from the content.
const heads = [];
for (const l of gotchaBody.split(/\r?\n/)) {
  const m = /^(\d+)\.\s+\*\*(.+?)\*\*/.exec(l);
  if (m) heads.push({ n: Number(m[1]), t: m[2].replace(/\s+/g, " ") });
}
heads.sort((a, b) => a.n - b.n);

const index = heads
  .map((h) => `${String(h.n).padStart(2)}. **${h.t.slice(0, 78)}**`)
  .join("\n");

const gotchasDoc = `# Gotchas

Every mistake this repository has actually made, numbered. The numbers are
stable and are cited from code comments across \`src/\` and \`scripts/\` — so
they are never renumbered, only moved. If a comment says "gotcha 31", the entry
numbered 31 is below.

**These are not trivia.** Every one of them shipped as a file that looked fine.
Read this file before changing anything that measures, measures timing, or
chooses a font.

## Index

${index}

---

${gotchaBody.replace(/^## Gotchas that cost us time \(do not rediscover these\)/m, "## The full list")}
`;

if (DRY) {
  console.log("  DRY RUN. would write docs/GOTCHAS.md with " + heads.length + " gotchas");
  console.log("  AGENTS.md would go from " + lines.length + " to ~" + (before.length + after.length) + " lines (before the rewrite)");
} else {
  fs.writeFileSync(path.join(ROOT, "docs", "GOTCHAS.md"), gotchasDoc, "utf8");
  console.log("  wrote docs/GOTCHAS.md (" + heads.length + " gotchas, numbers preserved)");
}
