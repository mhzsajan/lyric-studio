// size_ladder.cjs -- ONE song, three sizes, full length. For choosing a size.
//
//   node scripts/size_ladder.cjs              # Kali Kali, all three, full length
//   node scripts/size_ladder.cjs --clip 45    # 45-second preview instead
//
// WHY FULL LENGTH AND NOT A CLIP
// ------------------------------
// A 45-second clip showed the worst-case line ("काली काली हिस्सी परेकी..", four
// words) but the size has to hold up over a whole song, including the phrase
// layouts and the roam presentation, which wrap differently. Judging on a clip
// and then re-rendering full length is a second render anyway, so this does the
// full thing directly: pick from three complete songs.
//
// WHY THE PEAK, NOT THE BASE, IS PRINTED
// ---------------------------------------
// "--size" is the floor. Two multipliers stack on it, so the largest word on
// screen is:
//
//     peak = base * (1 + size-var) * (1 + size-drift)
//
// which is why "drop the base 5pt" barely moves the screen. Across these rungs
// the base falls 150 -> 90, a 40% cut, while the peak falls 212px -> 98px, a 54%
// cut. The peak is the number that decides whether text fills the frame, so it
// is the one to read.
//
// NO SCAN HERE
// ------------
// scan_visibility.py proves end timings, and every rung uses the same cue data,
// the same ends file and the same seven depth layers -- so a rung cannot pass
// where another failed. Scanning three 7-minute videos costs more than the
// render. The chosen rung is scanned when it is promoted to a real render.
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.resolve(__dirname, "..");
const SONG = "Kali Kali";
const OUT = "G:\\Lyrical Video\\Kali Kali";
const FONT = path.join(ROOT, "..", "nepali-legacy-fonts", "fonts", "yantramanav", "Yantramanav-Black.ttf");

// [base, sizeVar, sizeDrift, label]
const RUNGS = [
  [120, 0.10, 0.06, "A"],
  [105, 0.08, 0.05, "B"],
  [90, 0.06, 0.04, "C"],
];

const clipAt = process.argv.indexOf("--clip");
const LENGTH = clipAt >= 0 ? process.argv[clipAt + 1] : "409.1";

process.stdout.write(`\n  ${SONG}, 3 sizes, ${LENGTH}s each\n`);
for (const [b, v, d, l] of RUNGS) {
  process.stdout.write(`    ${l}  base ${String(b).padStart(3)}  var ${v}  drift ${d}  peak ~${Math.round(b * (1 + v) * (1 + d))}px\n`);
}
process.stdout.write("\n");

for (const [base, v, d, label] of RUNGS) {
  const out = path.join(OUT, `_size-${label}-${base}.mp4`);
  const peak = Math.round(base * (1 + v) * (1 + d));
  process.stdout.write(`  [${label}] base ${base} -> peak ~${peak}px  `);
  const t0 = Date.now();
  try {
    execFileSync(process.execPath, [
      path.join(ROOT, "render.mjs"),
      "G:\\Lyrical Video\\001 Audios\\Kali Kali.mp3",
      path.join(OUT, "Kali Kali.lrc"),
      "--no-audio", "--length", LENGTH,
      "--depth", "wild", "--motion", "wild", "--word-anim", "mix",
      "--letter-anim", "pop", "--letter-var", "0.03",
      "--size-mode", "word", "--size-var", String(v), "--size-drift", String(d),
      "--mode", "mix", "--mix-block", "8",
      "--size", String(base),
      "--shadow", "0 3px 16px rgba(0,0,0,0.85)",
      "--font-file", FONT,
      "--out", out,
    ], { cwd: ROOT, stdio: "pipe", encoding: "utf-8" });
    const mb = (fs.statSync(out).size / 1048576).toFixed(1);
    process.stdout.write(`ok  ${mb} MB  ${((Date.now() - t0) / 60000).toFixed(1)}m\n`);
  } catch (err) {
    process.stdout.write("FAILED\n");
    const log = ((err.stdout || "") + (err.stderr || "")).split("\n")
      .filter((l) => /rror/.test(l)).slice(0, 3);
    for (const l of log) process.stdout.write("        " + l.trim().slice(0, 100) + "\n");
  }
}

process.stdout.write(`\n  in ${OUT}:\n`);
for (const [base, , , label] of RUNGS) {
  const f = path.join(OUT, `_size-${label}-${base}.mp4`);
  if (fs.existsSync(f)) {
    process.stdout.write(`    _size-${label}-${base}.mp4   ${(fs.statSync(f).size / 1048576).toFixed(1)} MB\n`);
  }
}
process.stdout.write("\n  same song, same font, same layers -- only the size differs.\n");
process.stdout.write("  tell me A, B or C.\n\n");