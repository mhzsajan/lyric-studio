// Unit test for src/beats.js -- run: node scripts/check_beats.mjs
//
// The test song is the synthetic 120 BPM click track (test-assets/): beats on
// a 0.5 s grid. Assertions use that grid as ground truth.
import { anchorsForCue, lastBeatBefore } from "../src/beats.js";
import { wordTimings } from "../src/word-timing.js";

let failures = 0;
const ok = (name, cond, detail = "") => {
  console.log("  " + (cond ? "PASS" : "FAIL") + "  " + name + (detail ? "  (" + detail + ")" : ""));
  if (!cond) failures++;
};

// 64 beats, 0.5 s apart (the test song's exact grid).
const beats = Array.from({ length: 64 }, (_, i) => i * 0.5);

// --- lastBeatBefore ---------------------------------------------------------
ok("lastBeatBefore before first beat -> null", lastBeatBefore(-0.1, beats) === null);
{
  const b = lastBeatBefore(4.3, beats);
  ok("lastBeatBefore(4.3) -> beat 4.0, since 0.3", b && Math.abs(b.since - 0.3) < 1e-9 && beats[b.index] === 4.0);
}
{
  const b = lastBeatBefore(4.0, beats);
  ok("lastBeatBefore exactly on a beat -> since 0", b && b.since === 0);
}
ok("lastBeatBefore with no beats -> null", lastBeatBefore(5, null) === null);

// --- anchorsForCue ----------------------------------------------------------
// The test song's first cue: 4.0-6.0 s, four Devanagari words with virama and
// candrabindu -- the same text the legacy layouts cannot write.
const cue = { time: 4.0, end: 6.0, text: "फर्केर हेर्दा तिमी सँगै" };
const base = wordTimings(cue);
ok("baseline has 4 words", base.length === 4, base.map((w) => w.start.toFixed(2)).join(", "));

const anchors = anchorsForCue(cue, beats, 0.4);
ok("anchors returned for a 0.5 s grid", Array.isArray(anchors) && anchors.length === 4);

// With beats every 0.5 s and a 2 s cue, every distributed start has a beat
// within 0.4 s -- except possibly the first word, whose baseline start is the
// cue start itself (4.0, exactly on a beat). So: all four snapped.
const allSnapped = anchors.every((a) => a !== undefined);
ok("every word snapped to the grid", allSnapped, JSON.stringify(anchors));

const onGrid = anchors.every((a) => a === undefined || Math.abs(a / 0.5 - Math.round(a / 0.5)) < 1e-9);
ok("every anchor is on the 0.5 s grid", onGrid);

const moved = anchors.every((a, i) => a === undefined || Math.abs(a - base[i].start) <= 0.4 + 1e-9);
ok("no word moved more than beatTol", moved);

const snapped = wordTimings(cue, { anchors });
const monotonic = snapped.every((w, i) => i === 0 || w.start >= snapped[i - 1].start - 1e-12);
ok("snapped starts are monotonic", monotonic, snapped.map((w) => w.start.toFixed(2)).join(", "));
const saneEnds = snapped.every((w) => w.end > w.start);
ok("every word keeps a positive slot (end > start)", saneEnds);

// tol = 0 disables snapping entirely.
ok("beatTol 0 -> no anchors", anchorsForCue(cue, beats, 0) === undefined);
// No beats -> no anchors (the un-beat-synced render path).
ok("no beats -> undefined", anchorsForCue(cue, null) === undefined);
ok("empty beats -> undefined", anchorsForCue(cue, []) === undefined);

// A cue with NO beat inside its window must fall back, not stretch: beats only
// from 20 s onward, cue at 4-6 s.
const far = Array.from({ length: 24 }, (_, i) => 20 + i * 0.5);
ok("beats far away -> no anchors", anchorsForCue(cue, far, 0.4) === undefined);

// A snapped-forward anchor past the word's own end must be dropped (the
// zero-length-slot guard): one beat only, late in the cue. Word 1 baseline
// start is 4.0, end ~4.67; a lone beat at 5.9 is beyond tol for word 1 but
// within tol for the LAST word (baseline ~5.56, end 6.0) -- and 5.9 < 6.0 so
// it may snap. Assert the guard directly with a beat inside tol but past end:
// word 4 baseline start ~5.56 end 6.0; tol 0.5 would admit a beat at 6.05 --
// past the end -> must be dropped.
{
  const lateBeat = [6.05];
  const a2 = anchorsForCue({ time: 4.0, end: 6.0, text: "फर्केर हेर्दा तिमी सँगै" }, lateBeat, 0.5);
  const dropped = a2 === undefined || a2.every((x) => x === undefined || x < 6.0);
  ok("anchor past a word's end is dropped", dropped, JSON.stringify(a2));
}

console.log(failures ? "\n  " + failures + " FAILURE(S)" : "\n  all beats.js assertions passed");
process.exit(failures ? 1 : 0);
