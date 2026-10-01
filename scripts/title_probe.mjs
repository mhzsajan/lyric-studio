// title_probe.mjs -- how many times does this song's title word appear in its lyric?
//
//   node scripts\title_probe.mjs <file.remotion_start.lrc>
//
// It exists because the batch runner does not forward render.mjs's title report, so
// there was no way to see the answer for all seven songs at once without rendering
// them. It is the same matcher the renderer uses -- src/title.js -- so it cannot
// disagree with it, which a reimplementation could.
//
// The .lrc format here is [mm:ss.xx] with CENTISECONDS and SEVERAL timestamps on one
// line for a repeated refrain, so a line can be sung at 01:37, 04:01 and 06:06 at
// once. A probe that assumes one timestamp per line sees nothing at all, which is
// how the first version of this reported an empty file that was not empty.
import { readFileSync } from "node:fs";
import { titleWordFlags, titleTokens } from "../src/title.js";

const file = process.argv[2];
if (!file) {
  console.error("give me an .lrc");
  process.exit(2);
}
const raw = readFileSync(file, "utf8");
const m = /\[ti:([^\]]*)\]/i.exec(raw);
const title = m ? m[1].trim() : "";
const words = titleTokens(title);

const TS = /\[(\d+):(\d+(?:\.\d+)?)\]/g;
const lines = [];
for (const rawLine of raw.split(/\r?\n/)) {
  const stamps = [...rawLine.matchAll(TS)];
  if (!stamps.length) continue;
  const text = rawLine.replace(TS, "").trim();
  if (text) lines.push({ stamps, text });
}

let cues = 0, hits = 0;
const where = [];
for (const { stamps, text } of lines) {
  for (const s of stamps) cues++;
  const f = titleWordFlags(text, [title]);
  const n = f.filter(Boolean).length;
  if (n) {
    hits += n;
    const t = Number(stamps[0][1]) * 60 + Number(stamps[0][2]);
    where.push(`${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`);
  }
}

if (!words.length) {
  console.log("no title words -- pass --title-word to set one");
} else if (!hits) {
  console.log(`title words [${words.join(", ")}] appear in NO line. Needs --title-word.`);
} else {
  console.log(`fires on ${hits} word(s) across ${where.length} line(s), first at ${where[0]}`);
}
