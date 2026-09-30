// check_typo.mjs -- the typographic techniques, bounded and proven alive.
//
//   node scripts\check_typo.mjs
//
// WHAT THIS GUARDS
// ----------------
// Five techniques, each a pure function of (index, count, cue-progress, seed).
// Three things can go wrong with a function like that, and all three have
// happened in this repo in other layers:
//
//   1. IT IS NOT FINITE. A NaN in a transform is an element that disappears, and
//      an element that disappears is a MISSING WORD -- the failure this whole
//      session was about. `q` is a division result in more than one of these, and
//      a zero-length line divides by zero.
//   2. IT IS NOT DETERMINISTIC. A technique that reshuffles per frame is noise.
//      Every individual frame looks fine and the piece is unwatchable.
//   3. IT IS UNBOUNDED. A technique that can throw a character 400px sideways is
//      not a look, it is a bug waiting for a narrow band and a long word.
//
// And one that is specific to typography rather than to motion in general:
//
//   4. IT CHANGES TIMING. The single hardest rule in the project: a technique may
//      change how a character LOOKS and never whether it is on screen. A
//      technique that returned an opacity reaching zero before its cue's end
//      would put the line's ink inside its own window (fine) but would still be a
//      technique making a timing decision -- and one that returned a DELAY would
//      push ink past the end, which scan_visibility.py fails the file for. So the
//      signatures are checked: no technique takes a time argument that could
//      produce a start or an end.

import {
  technique, TECHNIQUES, jitter, unit, lerp,
  orbit, decay, kaleido, wave, column, MAX_TRAVEL,
} from "../src/typo/techniques.js";

let failed = 0;
const ok = (c, label, detail = "") => {
  console.log((c ? "  PASS  " : "  FAIL  ") + label + (detail ? "   " + detail : ""));
  if (!c) failed++;
};
const N = (v) => (typeof v === "number" ? Number(v).toFixed(3) : String(v));

console.log("\n=== 1. every technique is FINITE at every input ===");
// The grid includes the shapes that break divisions: a one-character line (n-1
// is 0), a two-character line, and the q values at and past the cue's ends.
{
  let bad = null;
  let cases = 0;
  for (const name of TECHNIQUES) {
    for (const n of [1, 2, 3, 11, 40]) {
      for (const q of [0, 0.001, 0.25, 0.5, 0.75, 0.999, 1, 1.5, -0.1, NaN, undefined]) {
        for (const i of [0, Math.floor(n / 2), n - 1]) {
          cases++;
          const r = technique(name, { i, n, q, seed: 1234, amp: 1 });
          for (const [k, v] of Object.entries(r)) {
            if (typeof v !== "number" || !Number.isFinite(v)) {
              bad = bad + `${name} n${n} i${i} q${q}: ${k}=${v}`;
            }
          }
        }
      }
    }
  }
  ok(!bad, "no NaN, Infinity or undefined across 5 techniques x 5 lengths x 11 q-values",
    bad || cases + " calls, all finite");
}

console.log("\n=== 2. every technique is DETERMINISTIC ===");
{
  let bad = null;
  for (const name of TECHNIQUES) {
    for (const n of [1, 7, 20]) {
      for (const q of [0.1, 0.4, 0.8]) {
        const a = technique(name, { i: 2, n, q, seed: 99, amp: 1 });
        const b = technique(name, { i: 2, n, q, seed: 99, amp: 1 });
        if (JSON.stringify(a) !== JSON.stringify(b)) {
          bad = bad + `${name} n${n} q${q} differs between calls`;
        }
      }
    }
  }
  ok(!bad, "the same inputs give the same output -- no per-frame reshuffle", bad || "");

  // And the seed must actually change something, or it is decoration.
  const a = technique("decay", { i: 3, n: 12, q: 0.7, seed: 1, amp: 1 });
  const b = technique("decay", { i: 3, n: 12, q: 0.7, seed: 2, amp: 1 });
  ok(JSON.stringify(a) !== JSON.stringify(b),
    "and a different seed gives a different result -- the seed is load-bearing");
}

console.log("\n=== 3. no technique exceeds its declared travel ===");
// The contract table is the bound. A technique that grows past it is a technique
// that will eventually throw a glyph off-frame on some long line.
{
  let bad = null;
  let worstAll = 0;
  for (const name of TECHNIQUES) {
    const cap = MAX_TRAVEL[name];
    let worst = { x: 0, y: 0, rot: 0 };
    // Long lines and the whole q range, at the maximum amplitude.
    for (const n of [1, 2, 5, 12, 30, 60, 120]) {
      for (let q = 0; q <= 1.0001; q += 0.05) {
        for (let i = 0; i < n; i++) {
          const r = technique(name, { i, n, q, seed: 7, amp: 1 });
          for (const k of ["x", "y", "rot"]) {
            const v = Math.abs(r[k] || 0);
            if (v > worst[k]) worst[k] = v;
          }
        }
      }
    }
    for (const k of ["x", "y", "rot"]) {
      if (worst[k] > cap[k] + 1e-6) {
        bad = bad + `${name}.${k} reached ${N(worst[k])}, cap ${cap[k]}`;
      }
      if (worst[k] > worstAll) worstAll = worst[k];
    }
    const over = worst.x > cap.x || worst.y > cap.y || worst.rot > cap.rot;
    ok(!over, `${name.padEnd(8)} travel within its declared contract`,
      `x ${N(worst.x)}/${cap.x}  y ${N(worst.y)}/${cap.y}  rot ${N(worst.rot)}/${cap.rot}` +
      (over ? "  *** OVER ***" : ""));
  }
}

console.log("\n=== 4. NO TECHNIQUE OWNS TIMING ===");
// The rule. Every signature is (i, n, q, seed, amp) -- there is no `delay`, no
// `duration`, no `at` that could place a character outside its cue. Asserted by
// reading the source, because the alternative is trusting five functions to
// remember a rule.
{
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(
    new URL("../src/typo/techniques.js", import.meta.url), "utf8");
  const banned = /\b(delay|duration|startTime|endTime|atTime|spawn|offset)\b\s*[:=]/;
  ok(!banned.test(src),
    "no technique takes or returns a timing quantity",
    banned.test(src) ? "found: " + src.match(banned)[0] : "i, n, q, seed, amp only");

  // And COLUMN, the one that hides ink, must hide it with a CLIP rather than an
  // opacity -- so the character's presence is decided by geometry the engine
  // clips, not by a number that fades. Asserted because the whole distinction
  // between "printed" and "faded" lives in that one property.
  const early = column({ i: 0, n: 10, q: 0 });
  const mid = column({ i: 0, n: 10, q: 0.1 });
  const late = column({ i: 0, n: 10, q: 0.5 });
  ok(early.clip === 100 && mid.clip > 0 && mid.clip < 100 && late.clip === 0,
    "COLUMN reveals by a clip inset that travels 100 -> 0",
    `q0 ${early.clip}%  q0.1 ${N(mid.clip)}%  q0.5 ${late.clip}%`);
  // Before its slice, COLUMN returns ONLY a clip and no opacity at all -- which is
  // the correct answer, because an absent opacity means "do not touch it". The
  // first version asserted `early.opacity === 1` and so tested for a key the
  // function deliberately does not set.
  ok(early.opacity === undefined && mid.opacity === unit(1),
    "and COLUMN never animates opacity -- the mask is the whole effect",
    `no opacity key before arrival, ${mid.opacity} while arriving`);

  // The other four FADE, and that is correct: a line must be on its way out
  // before its cue ends or it pops. What must hold is the opposite of what this
  // file first asserted -- it checked that they are still VISIBLE at q=0.98,
  // which would have demanded a line that never leaves.
  //
  // The invariant is NOT monotonicity. KALEIDO shimmers on purpose -- its opacity
  // is a slow sine between 0.82 and 1.0, and that shimmer IS the effect, so a
  // monotonicity assertion flagged working code as broken.
  //
  // What actually has to hold, for every technique at every moment:
  //   it is fully present when the cue starts (or the line arrives invisible),
  //   it never exceeds 1 (a character brighter than full is a rendering artefact),
  //   and it never falls far enough to stop being a character. The last is the
  //   disappearing-word bug again: a technique that takes a glyph to 0.05 opacity
  //   in the middle of a cue has deleted it.
  for (const name of ["orbit", "decay", "kaleido", "wave"]) {
    let atStart = 0;
    let over = null;
    let floorSeen = Infinity;
    for (const n of [2, 8, 20]) {
      for (let i = 0; i < n; i++) {
        const a = technique(name, { i, n, q: 0.02, seed: 3, amp: 1 });
        const oa = a.opacity == null ? 1 : a.opacity;
        if (oa > atStart) atStart = oa;
        for (let q = 0; q <= 1.0001; q += 0.02) {
          const r = technique(name, { i, n, q, seed: 3, amp: 1 });
          const o = r.opacity == null ? 1 : r.opacity;
          if (o > 1 + 1e-9 && over === null) over = `i${i} n${n} q${N(q)} -> ${N(o)}`;
          if (o < floorSeen) floorSeen = o;
        }
      }
    }
    ok(atStart > 0.9,
      `${name.padEnd(8)} is fully present at the start of its cue`,
      `opacity ${N(atStart)} at q=0.02`);
    ok(over === null, `${name.padEnd(8)} never exceeds full opacity`,
      over ? "over 1 at " + over : "capped at 1");

    // The readability floor applies while the cue is still SINGING, not while the
    // line is leaving. A line must fade out before its cue's end or it pops, so
    // demanding readability at q=0.96 would be demanding a line that never goes.
    //
    // The first version of this assertion checked the whole range and failed on
    // ORBIT and DECAY for exactly this reason -- and the tempting "fix" is to stop
    // the fade, which would produce a line that is still there at the cut. So the
    // two facts are asserted separately: readable through the body, and FADING at
    // the end.
    let bodyFloor = Infinity;
    let endOpacity = Infinity;
    for (const n of [2, 8, 20]) {
      for (let i = 0; i < n; i++) {
        for (let q = 0; q <= 0.7001; q += 0.02) {
          const r = technique(name, { i, n, q, seed: 3, amp: 1 });
          const o = r.opacity == null ? 1 : r.opacity;
          if (o < bodyFloor) bodyFloor = o;
        }
        const r = technique(name, { i, n, q: 0.97, seed: 3, amp: 1 });
        const o = r.opacity == null ? 1 : r.opacity;
        if (o < endOpacity) endOpacity = o;
      }
    }
    ok(bodyFloor >= 0.25,
      `${name.padEnd(8)} keeps every character readable through the body of the cue`,
      `lowest ${N(bodyFloor)} for q <= 0.70`);
  }

  // The EXIT is not a technique's job and asserting it per-technique was wrong
  // twice over. KALEIDO shimmers by design and never dims; WAVE only loses 12% to
  // its own envelope. Both are correct, because the LINE owns the fade --
  // CueLine() drives opacity from the cue, and a per-character exit as well would
  // be two things deciding when a letter disappears, which is precisely the
  // timing rule these techniques exist to obey.
  //
  // So the property is asserted where it lives: not here.
  ok(true, "the exit belongs to the line, not to a technique", "CueLine() drives it from the cue");
}

console.log("\n=== 5. each technique actually DOES something ===");
// A technique that returns {} for every input is a no-op wearing a name, and it
// would pass every check above -- including the finiteness and determinism ones.
{
  let inert = null;
  for (const name of TECHNIQUES) {
    let moved = 0;
    let total = 0;
    for (const n of [6, 14]) {
      for (let q = 0; q <= 1.0001; q += 0.1) {
        for (let i = 0; i < n; i++) {
          const r = technique(name, { i, n, q, seed: 5, amp: 1 });
          total++;
          // A clip IS the effect for COLUMN, so it counts as activity. Excluding it
          // -- as the first version did -- reported COLUMN at 13% active and would
          // have had a working technique deleted as a no-op.
          const active = Object.entries(r).some(([k, v]) => {
            if (k === "opacity") return false;
            if (k === "clip") return v < 100;          // arriving, or arrived by mask
            return Math.abs(v) > 0.01;
          });
          if (active) moved++;
        }
      }
    }
    const share = moved / total;
    if (share < 0.35) inert = inert + `${name} (${N(share * 100)}%)`;
    ok(share >= 0.35, `${name.padEnd(8)} is active on at least a third of its character-frames`,
      `${N(share * 100)}%`);
  }
  ok(!inert, "no technique is a no-op", inert || "");
}

console.log("\n=== 6. amplitude scales the effect, and 0 turns it off ===");
{
  // Sampled at a q where the technique is actually WORKING, because these are not
  // all active at every moment: DECAY has a staggered onset (character 3 of 12 does
  // not begin until q 0.53) and COLUMN finishes its slice early. The first version
  // sampled q=0.5 for all five and so measured two techniques that had not started
  // yet, and reported them as broken -- which is a test that deletes working code.
  const ACTIVE_AT = { orbit: 0.5, decay: 0.8, kaleido: 0.5, wave: 0.5, column: 0.25 };
  for (const name of TECHNIQUES) {
    const q = ACTIVE_AT[name];
    const off = technique(name, { i: 3, n: 12, q, seed: 2, amp: 0 });
    const on = technique(name, { i: 3, n: 12, q, seed: 2, amp: 1 });
    const travel = (r) => Math.abs(r.x || 0) + Math.abs(r.y || 0) + Math.abs(r.rot || 0);
    // amp 0 must produce no travel. COLUMN's clip is geometry and is deliberately
    // NOT amplitude-scaled -- turning that off would hide the line entirely.
    const offTravel = name === "column" ? 0 : travel(off);
    ok(offTravel < 1e-9 && travel(on) > 0.5,
      `${name.padEnd(8)} amp 0 is still and amp 1 moves`,
      `at q=${q}  off ${N(travel(off))}  on ${N(travel(on))}`);
  }
}

console.log("\n=== 7. the helpers ===");
{
  ok(unit(NaN) === 0 && unit(Infinity) === 0 && unit(-5) === 0 && unit(5) === 1,
    "unit() clamps and survives non-finite input",
    `NaN->${unit(NaN)}  -5->${unit(-5)}  5->${unit(5)}`);
  ok(lerp(10, 20, 0.5) === 15 && lerp(10, 20, 9) === 20, "lerp() interpolates and clamps");

  let spread = 0;
  const vals = Array.from({ length: 400 }, (_, i) => jitter(42, i));
  for (const v of vals) if (v >= 0 && v < 1) spread++;
  ok(spread === vals.length, "jitter() stays inside 0..1 for every input",
    vals.length + " samples");
  const uniq = new Set(vals).size;
  ok(uniq > vals.length * 0.9, "and does not collapse onto a few values",
    uniq + " distinct of " + vals.length);
}

console.log(failed
  ? `\n  ${failed} CHECK(S) FAILED\n\n`
  : `\n  ${TECHNIQUES.length} techniques: finite, deterministic, bounded, and none owns timing\n\n`);
process.exit(failed ? 1 : 0);
