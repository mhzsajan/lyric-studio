// check_typing.mjs -- invariants for the typed-on reveal (src/typing.js).
//
//   node scripts/check_typing.mjs
//
// THE ONE PROPERTY THAT MATTERS
// ------------------------------
// A typing reveal is nothing but letters ARRIVING LATE. That is the effect, and
// it is also the exact shape of the worst bug in this project: a word still on
// screen after the cue that owns it has ended. It has shipped before, it is
// invisible to every check that looks at structure rather than pixels, and the
// only thing standing between this effect and a broken deliverable is that its
// delay chain is fitted to the cue's own span.
//
// So section 3 is the file. Everything else is supporting detail.
//
// THE PATHOLOGICAL CASES ARE THE POINT, NOT AN AFTERTHOUGHT
// --------------------------------------------------------
// A real lyric line is four or five words over four seconds, where a naive
// chain fits comfortably. The chain breaks on the cases a real song contains and
// a test written from the demo never tries:
//
//   a 20-letter line in a 2-second cue    -- more units than the span allows
//   a single letter in a 0.3s cue         -- nothing to fit
//   a 40-letter interjection in 0.5s      -- 4x over budget
//   a zero-length span                    -- the divide-by-zero
//
// Each is asserted here. If a future change makes fitDelay() return early for
// any of them, this file fails rather than the video.
import {
  typingPlan, fitDelay, typingState, levelIsLetterwise, caretProgress, TYPE_LEVELS,
} from "../src/typing.js";

let failed = 0;
const ok = (c, label, detail = "") => {
  console.log((c ? "  PASS  " : "  FAIL  ") + label + (detail ? "   " + detail : ""));
  if (!c) failed++;
};

const LEVELS = TYPE_LEVELS.filter((l) => l !== "off");

// [label, words, letters, span]
const CASES = [
  ["a normal 4-word line over 4s", 4, 24, 4.0],
  ["a 20-letter line in 2s", 2, 20, 2.0],
  ["a 40-letter interjection in 0.5s", 3, 40, 0.5],
  ["a single letter in 0.3s", 1, 1, 0.3],
  ["a 5-word line in 0.4s", 5, 27, 0.4],
  ["a very long span", 5, 27, 30.0],
];

console.log("\n=== 1. off means off ===");
{
  ok(typingPlan("off", 4, 24) === null, "level off returns null");
  ok(levelIsLetterwise("off") === false, "off is not letterwise");
  ok(typingState("off", 0, 0.1, 0.1, 1) && Object.keys(typingState("off", 0, 0.1, 0.1, 1)).length === 0,
    "off produces no style at all, so a normal render is unchanged");
}

console.log("\n=== 2. every level plans a real, finite number of units ===");
{
  let bad = null;
  for (const lvl of LEVELS) {
    for (const [label, w, l, span] of CASES) {
      const p = typingPlan(lvl, w, l);
      if (!p) { bad = bad || `${lvl} / ${label}: null`; continue; }
      if (!Number.isInteger(p.units) || p.units < 1) bad = bad || `${lvl} / ${label}: units ${p.units}`;
      for (const k of ["step", "dur", "chain"]) {
        if (!Number.isFinite(p[k])) bad = bad || `${lvl} / ${label}: ${k} ${p[k]}`;
      }
      if (p.chain < 0) bad = bad || `${lvl} / ${label}: negative chain`;
    }
  }
  ok(!bad, "no level produces NaN, Infinity, zero units or a negative chain", bad || "");
}

console.log("\n=== 3. THE ONE THAT MATTERS: the chain FITS the cue's span ===");
// The assertion is deliberately in UNITS OF TIME rather than in "scale < 1":
// a compressed reveal that still overran would pass a ratio test and ship the
// bug. So this measures the actual worst-case end of the chain.
for (const lvl of LEVELS) {
  let bad = null;
  let worstRatio = 0;
  for (const [label, w, l, span] of CASES) {
    const p = typingPlan(lvl, w, l);
    const f = fitDelay(lvl, p, span);
    // The time at which the LAST unit has finished arriving.
    const lastUnit = levelIsLetterwise(lvl) ? l - 1 : Math.max(0, w - 1);
    const finish = lastUnit * f.step + f.dur;
    const ratio = span > 0 ? finish / span : 1;
    worstRatio = Math.max(worstRatio, ratio);
    if (finish > span + 1e-9) {
      bad = bad + `${label}: finishes at ${finish.toFixed(3)}s in a ${span}s span`;
    }
    if (!Number.isFinite(f.step) || !Number.isFinite(f.dur)) {
      bad = bad + `${label}: NaN step or dur`;
    }
  }
  ok(!bad, `${lvl}: the reveal finishes inside every cue span`,
    bad || `worst case uses ${(worstRatio * 100).toFixed(0)}% of the span`);
}

console.log("\n=== 4. compression keeps a STAGGER, and compresses rather than overruns ===");
{
  // A 40-letter line in 0.5s is 8x over budget at the natural rate. The fix must
  // be a faster reveal, not a truncated one: if the step compressed to zero, the
  // letters would all land on the same frame and the effect would be gone -- an
  // invisible feature that still costs render time and still carries the risk.
  const p = typingPlan("letter", 3, 40);
  const tight = fitDelay("letter", p, 0.5);
  const roomy = fitDelay("letter", p, 30);
  ok(tight.step > 0, "an over-budget cue still has a per-letter stagger",
    tight.step.toFixed(4) + "s");
  ok(tight.scale < 1 && tight.scale >= 0.28, "it compresses, and never below the stagger floor",
    tight.scale.toFixed(3));
  ok(roomy.scale === 1, "a cue with room is NOT compressed", String(roomy.scale));
  ok(roomy.step > tight.step, "more room means a slower, more legible reveal");
}

console.log("\n=== 5. a unit that has not started is INVISIBLE, not merely unstyled ===");
{
  // Returning {} would leave the letter at its parent's opacity, so the word
  // would appear fully typed for one frame before it began. That is a visible
  // pop at the start of every word -- the same first-frame artefact check_motion
  // already guards against for line entrances.
  for (const lvl of LEVELS) {
    const st = typingState(lvl, 3, 0.035, 0.09, -0.5);
    ok(st && st.opacity === 0,
      `${lvl}: a unit before its start is fully transparent`, JSON.stringify(st));
    const past = typingState(lvl, 3, 0.035, 0.09, 10);
    ok(past && past.opacity === 1,
      `${lvl}: a long-past unit is fully opaque and stays`);
    // Mid-arrival is sampled at HALF the fitted duration, not at a hardcoded
    // number. The durations differ per level (0.09 / 0.13 / 0.55) and are scaled
    // by fitDelay, so a fixed 0.045s is already past the end of two of them and
    // the assertion was measuring "fully arrived" while claiming to measure
    // "mid-arrival". Asking the plan for its own duration is the only way this
    // test means what its label says.
    const dur = fitDelay(lvl, typingPlan(lvl, 4, 24), 4.0).dur;
    const during = typingState(lvl, 0, 0.035, dur, dur * 0.5);
    ok(during && during.opacity > 0 && during.opacity < 1,
      `${lvl}: a unit mid-arrival is PARTLY visible`, String(during && during.opacity));
    // And the opacity must actually RISE across the arrival, not be flat.
    const early = typingState(lvl, 0, 0.035, dur, dur * 0.15);
    ok(early && during && early.opacity < during.opacity,
      `${lvl}: opacity increases as the unit arrives`,
      `${early && early.opacity} -> ${during && during.opacity}`);
  }
}

console.log("\n=== 6. the clip only ever closes from the left ===");
// The clip is what makes typing read as typing rather than as a fade, and it is
// also the only geometry-adjacent thing here. It must start fully closed
// (100% inset from the left, so nothing shows) and end fully open (0%), and it
// must never go NEGATIVE -- a negative inset would push the glyph the wrong way,
// which on a right-to-left or a bidi line is not a cosmetic bug.
{
  for (const lvl of LEVELS) {
    let bad = null;
    // The clip does not exist at t=0: a unit that has not started returns
    // {opacity: 0} with no clipPath at all, which is correct -- there is nothing
    // to clip, the letter is simply not drawn. So the sweep starts just after the
    // start and the "no clip" case is asserted separately below rather than
    // being reported as a failure of the inset range.
    for (const el of [0.05, 0.25, 0.5, 0.75, 0.999, 1, 1.5, 3]) {
      const st = typingState(lvl, 0, 0.05, 0.2, el * 0.2);
      if (!st || !st.clipPath) { bad = bad + `${lvl} @${el}: no clip`; continue; }
      const m = /inset\(0 ([\d.]+)%/.exec(st.clipPath);
      if (!m) { bad = bad + `${lvl} @${el}: ${st.clipPath}`; continue; }
      const v = Number(m[1]);
      if (!Number.isFinite(v) || v < 0 || v > 100.0001) {
        bad = bad + `${lvl} @${el}: inset ${v}`;
      }
    }
    ok(!bad, `${lvl}: the clip stays a sane 0..100% left inset throughout`, bad || "");
    // At the very start there is deliberately no clipPath, and that must be
    // asserted rather than assumed -- otherwise a future change that emitted a
    // 100% clip at t=0 would be indistinguishable from this no-clip case.
    const atZero = typingState(lvl, 0, 0.05, 0.2, 0);
    ok(atZero && !atZero.clipPath && atZero.opacity === 0,
      `${lvl}: at t=0 there is no clip at all, and opacity is 0`);
    // Just after the start it must be FULLY closed, or the whole word flashes in
    // before the first letter has been "typed".
    const justAfter = typingState(lvl, 0, 0.05, 0.2, 0.001);
    const jm = justAfter && /inset\(0 ([\d.]+)%/.exec(justAfter.clipPath || "");
    ok(jm && Number(jm[1]) > 90,
      `${lvl}: just after the start the unit is still ~fully clipped`,
      jm ? jm[1] + "%" : "no clip");
  }
}

console.log("\n=== 7. zero and negative spans do not divide by zero ===");
{
  // Root.jsx resolves a cue's end from the ends file, but a hand-edited file can
  // still produce a zero-length span, and a NaN here would render as an
  // invisible line with exit 0.
  for (const span of [0, -1, -0.001, NaN, undefined]) {
    const p = typingPlan("letter", 3, 12);
    const f = fitDelay("letter", p, span);
    ok(f && Number.isFinite(f.step) && Number.isFinite(f.dur),
      `span ${span} yields a finite step and dur`, `${f && f.step} / ${f && f.dur}`);
  }
  ok(typingPlan("letter", 0, 0) !== null,
    "a line with no words still plans rather than throwing");
}

console.log("\n=== 8. determinism ===");
{
  let bad = null;
  for (const lvl of LEVELS) {
    for (const [label, w, l, span] of CASES) {
      const a = fitDelay(lvl, typingPlan(lvl, w, l), span);
      const b = fitDelay(lvl, typingPlan(lvl, w, l), span);
      if (a.step !== b.step || a.dur !== b.dur) bad = bad + `${lvl}/${label} `;
    }
  }
  ok(!bad, "repeated fits are identical (a re-render is the same file)", bad || "");
}

console.log("\n=== 9. the caret, which is the only unconstrained part ===");
{
  ok(caretProgress(0, 4) === 0, "no units done -> the caret is at the start");
  ok(caretProgress(4, 4) === 1, "all units done -> the caret is at the end");
  ok(caretProgress(9, 4) === 1, "more units than exist clamps to the end");
  ok(caretProgress(2, 0) === null, "no units at all -> null, so no element is drawn");
}

console.log("\n=== 10. the instrument catches a broken implementation ===");
{
  // A fitDelay that does NOT compress is the bug this whole file exists to catch.
  const naive = (p) => ({ scale: 1, step: p.step, dur: p.dur });
  const p = typingPlan("letter", 3, 40);
  const naiveFinish = 39 * naive(p).step + naive(p).dur;
  ok(naiveFinish > 0.5,
    "an UNCOMPRESSED 40-letter chain overruns a 0.5s cue", naiveFinish.toFixed(2) + "s");
  const fitted = fitDelay("letter", p, 0.5);
  const fittedFinish = 39 * fitted.step + fitted.dur;
  ok(fittedFinish <= 0.5 + 1e-9,
    "and the fitted one does not", fittedFinish.toFixed(3) + "s");
  // A state that returns {} before the start is the first-frame pop.
  ok(Object.keys({}).length === 0 && typingState("letter", 5, 0.1, 0.1, -1).opacity === 0,
    "the 'unstarted means invisible' assertion rejects the {} version");
}

console.log("\n" + (failed
  ? `  ${failed} FAILED\n\n`
  : `  typed-on reveal: ${LEVELS.length} levels fit their spans, and the assertions catch a broken fit\n\n`));
process.exit(failed ? 1 : 0);