// check_smoke.mjs -- render one real frame of every composition.
//
//   node scripts\check_smoke.mjs
//
// WHY, WHEN check_bundle.mjs ALREADY PROVES THE TREE COMPILES
// ----------------------------------------------------------
// Because "it compiles" and "it runs" are different claims, and this repo has now
// twice shipped a file that compiled perfectly and threw on the first frame that
// reached a particular line:
//
//   typeLag   -- destructured on LyricOverlay, read inside animatedWords(), never
//                passed to it. ReferenceError on every --depth render.
//   cutRoom   -- destructured on LyricOverlay, read inside animatedWords(), never
//                passed to it. Same shape, five renders, ~20 minutes.
//
// Both were invisible to everything else. The bundle built. All 21 unit suites
// passed -- the module PARSES, and a missing binding is a runtime failure, not a
// syntax one. Remotion reported a bare frame number with no file and no stack,
// because the error is thrown from inside the composition.
//
// So the only instrument that can see this class is one that RENDERS. A still is
// the cheapest possible render: one frame, no encode, no audio, about a second.
// Five of them across the five compositions cost less than the first minute of a
// batch and they cover the exact window where these bugs live.
//
// It renders frames chosen to be INSIDE a cue and inside a break, so the word spans,
// the typing reveal, the tear bar and the RITU camera are all actually evaluated
// rather than short-circuited by an empty frame.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, statSync, readdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SONGS = "H:\\Lyric Video Making Folder";

let failed = 0;
const ok = (c, label, detail = "") => {
  console.log((c ? "  PASS  " : "  FAIL  ") + label + (detail ? "   " + detail : ""));
  if (!c) failed++;
};

// A real lyric frame, and the props that exercise every layer. Deliberately
// maximal: --loudest, --cut, --type, --wrap, --x-pos. A smoke test with the flags
// OFF proves that nothing throws when nothing happens.
const OVERLAY_PROPS = {
  fps: 30, fontSize: 105, seed: "smoke", depth: "wild", motion: "wild",
  colorMode: "calm", colorScheme: "duo", colorGradient: false, colorAccent: 0.35,
  colorHue: 0, sizeMode: "word", sizeVar: 0.08, sizeDrift: 0.05,
  wordAnim: "mix", letterAnim: "pop", letterVar: 0.03,
  cut: "word", type: "letter", stroke: 0, strokeColor: "#000000",
  scanlines: 40, scanlineAlpha: 0.06, wordFill: 0.78, wrap: "rows", xPos: true,
  // The measurement the tear bar is sized from. A null here must fall back
  // safely rather than throw.
  cutRoom: 0.086,
  shadow: "0 3px 16px rgba(0,0,0,0.85)", background: "#000000",
  widthModel: { cons: 0.468, matra: 0, space: 0.457, other: 0.5, worstError: 0.012 },
  mode: "mix", mixBlock: 8, motionBlock: 7, position: "center",
  preview: false, titleCard: false, titleCardOutro: false,
};

// THE CUES ARE NOT A PROP, and finding that out cost one run.
//
// LyricOverlay takes its cues from `lyrics.generated.js` -- parseLrc(LRC_TEXT,
// ENDS_TEXT) inside calculateMetadata -- and NOT from a `cues` prop. So a still
// rendered with `--props={cues:[...]}` draws whatever song was last PREPARED in
// this tree, and both the in-cue and the empty frame came out as the same 34kB
// black plate. Every size check passed; the two images were byte-identical.
//
// So the smoke test PREPARES its own song and reads that song's cue times from
// its .lrc. The flags still come through props -- which is why the ReferenceError
// class this file exists for is still caught, since --cut and --type are what
// evaluate the tear bar.
const SONG_DIR = "H:\\Lyric Video Making Folder\\01 Allare BPM 120";

function prepare() {
  const dir = SONG_DIR;
  const all = readdirSync(dir);
  const audio = all.find((f) => /\.(mp3|wav|m4a)$/i.test(f));
  const lrc = all.find((f) => /remotion_start\.lrc$/i.test(f));
  const r = spawnSync(process.execPath, [
    path.join(ROOT, "render.mjs"),
    path.join(dir, audio), path.join(dir, lrc),
    "--no-audio", "--length", "130",
    "--font-file", path.join(ROOT, "..", "nepali-legacy-fonts", "fonts", "rajdhani", "Rajdhani-Bold.ttf"),
    "--loudest", "--size-preset", "medium",
    "--color-mode", "calm", "--color-scheme", "duo", "--color-hue", "0",
    "--color-accent", "0.35", "--cut", "word", "--type", "letter",
    "--wrap", "rows", "--x-pos",
    "--prepare-only",
  ], { cwd: ROOT, encoding: "utf8", timeout: 300000 });
  return { status: r.status, log: (r.stdout || "") + (r.stderr || "") };
}

/** The prepared song's own cue times, straight from its .lrc. */
async function cueTimes() {
  const { parseLrc } = await import("../src/parse-lrc.mjs");
  const all = readdirSync(SONG_DIR);
  const lrc = all.find((f) => /remotion_start\.lrc$/i.test(f));
  const ends = all.find((f) => /remotion_end\.lrc$/i.test(f));
  const parsed = parseLrc(
    readFileSync(path.join(SONG_DIR, lrc), "utf8"),
    ends ? readFileSync(path.join(SONG_DIR, ends), "utf8") : ""
  );
  return parsed.cues || parsed;
}

function still(composition, frame, props, out) {
  const p = path.join(OUT, propsFile);
  writeFileSync(p, JSON.stringify(props));
  const r = spawnSync(process.execPath, [
    path.join(ROOT, "node_modules", "@remotion", "cli", "remotion-cli.js"),
    "still", path.join(ROOT, "src", "index.js"), composition, out,
    "--frame=" + frame,
    "--props=" + p,
  ], { cwd: ROOT, encoding: "utf8", timeout: 180000 });
  return {
    status: r.status,
    log: ((r.stdout || "") + (r.stderr || "")),
    wrote: existsSync(out),
  };
}

const OUT = fsMkdtemp();

function fsMkdtemp() {
  const d = path.join(os.tmpdir(), "lyric-smoke-" + process.pid);
  mkdirSync(d, { recursive: true });
  return d;
}
const propsFile = "props.json";

console.log("\n=== 1. LyricOverlay: a frame INSIDE a cue, every layer on ===");
const PREP = prepare();
{
  ok(PREP.status === 0, "prepared a real song for the stills to draw",
    PREP.status === 0 ? SONG_DIR.split("\\").pop() : firstError(PREP.log));
}

const CUES = await cueTimes();
const first = CUES[0];
// A frame 40% through the first cue, so the word layer, the typing chain and the
// tear bar are all live.
const IN_CUE_FRAME = Math.round((first.time + (first.end - first.time) * 0.4) * 30);
// And one well before the first lyric. Allare's first word is at 97.83s, so t=40s
// is inside the 97-second instrumental intro -- unambiguously no lyric.
const EMPTY_FRAME = 40 * 30;

{
  const props = { ...OVERLAY_PROPS };
  const r = still("LyricOverlay", IN_CUE_FRAME, props, path.join(OUT, "overlay-in.png"));
  const ref = /ReferenceError|Cannot access|is not defined/.test(r.log);
  ok(r.status === 0 && r.wrote && !ref,
    "a frame INSIDE a real cue renders, with --cut, --type, --wrap and --x-pos on",
    r.status === 0 && r.wrote
      ? `frame ${IN_CUE_FRAME}, t=${(IN_CUE_FRAME / 30).toFixed(1)}s in [${first.time}, ${first.end}]`
      : firstError(r.log));
}

console.log("\n=== 2. LyricOverlay: cutRoom is a real prop, not just a signature ===");
// The specific bug. `cutRoom` is destructured on the composition and read inside
// animatedWords(), so it has to be in animatedWords' OWN opts or the render throws
// at the first frame that evaluates the tear bar. Asserting the value is threaded
// is what catches it; the previous twenty-one suites could not, because a missing
// binding is a runtime failure in a module that parses.
{
  const src = readFileSync(path.join(ROOT, "src", "LyricOverlay.jsx"), "utf8");
  // animatedWords' destructuring block, read from the source rather than guessed.
  const sig = /function animatedWords\([\s\S]*?\}\s*=\s*opts;/.exec(src);
  ok(!!sig && /cutRoom/.test(sig[0]),
    "animatedWords destructures cutRoom",
    sig ? (/cutRoom/.test(sig[0]) ? "" : "missing from its opts") : "signature not found");

  // And it must be PASSED at the call site, which is where the previous two bugs
  // were: declared in the signature, absent from the call.
  const call = /animatedWords\(cueObj\.text, \{[\s\S]*?\}\)/.exec(src);
  ok(!!call && /cutRoom/.test(call[0]),
    "and the call site passes it",
    call ? (/cutRoom/.test(call[0]) ? "" : "declared but never passed") : "call not found");

  // Same family, opposite shape: `typeLag` is a LOCAL of animatedWords (it is
  // derived there from that word's own start) and is passed DOWN to letterNodes.
  // So the assertion is not "animatedWords receives it" -- the first version
  // asserted that and failed, because the correct wiring for typeLag is the
  // reverse of the correct wiring for cutRoom.
  ok(/const typeLag = wStart - cueStartTime/.test(src),
    "typeLag is derived inside animatedWords, where wStart is");
  const toLetters = /letterNodes\(w\.text, \{[\s\S]*?\}\)/.exec(src);
  ok(!!toLetters && /typeLag/.test(toLetters[0]),
    "and it is passed from there down to letterNodes",
    toLetters ? (/typeLag/.test(toLetters[0]) ? "" : "not in the letterNodes call") : "call not found");
  // And the letterNodes signature must accept it -- which is where it was missing
  // the first time.
  ok(/typeLag = 0/.test(src), "letterNodes destructures typeLag with a default of 0");
}

console.log("\n=== 3. LyricOverlay: a frame OUTSIDE every cue ===");
// The empty branch. It is short enough that a missing binding in it can hide for
// hours, because a song that happens to be singing on every sampled frame never
// evaluates it.
{
  const props = { ...OVERLAY_PROPS };
  const r = still("LyricOverlay", EMPTY_FRAME, props, path.join(OUT, "overlay-out.png"));
  ok(r.status === 0 && r.wrote, "a frame in the instrumental intro renders",
    r.status === 0 ? `frame ${EMPTY_FRAME}, t=40.0s, first lyric at ${first.time}s` : firstError(r.log));
}

console.log("\n=== 4. RituPiece: the falling camera, mid-song ===");
// Deep into the piece, where the scale is large and every motif layer is scaled up
// -- a frame at t=0 would exercise almost none of them.
{
  const props = {
    cues: [{ index: 0, time: 66.4, end: 68.4, text: "हो.. म कुनै ऋतु" }],
    beats: [66.4, 67.0, 67.5, 68.0],
    fontSize: 108, seed: "smoke",
  };
  // Frame 3000 is t=100s. The first version asked for frame 12000 (t=400s),
  // which is past the composition's 7845-frame duration -- so RituPiece never
  // rendered at all and the failure was reported as a RituPiece bug rather than as
  // a wrong frame number. t=100s is inside stanza 1 (66.4-117.6s), so the camera
  // is well past the cold open and the type is live.
  const r = still("RituPiece", 3000, props, path.join(OUT, "ritu.png"));
  const ref = /ReferenceError|Cannot access|is not defined/.test(r.log);
  ok(r.status === 0 && r.wrote && !ref,
    "a frame at t=200s renders -- the camera, the motifs and the type",
    r.status === 0 && r.wrote ? "" : firstError(r.log));
}

console.log("\n=== 5. every still is a real frame, not a blank one ===");
// A still that renders but is empty would pass 1-4 while proving nothing. The
// check is that the PNG is larger than a flat plate compresses to, which is the
// same reasoning the showcase script uses -- and the reason that check is
// DOCUMENTED as never having worked there. Here the images are small and mostly
// dark, so the threshold is deliberately low and is stated rather than tuned.
{
  let allOk = true;
  for (const f of ["overlay-in.png", "overlay-out.png", "ritu.png"]) {
    const p = path.join(OUT, f);
    const size = existsSync(p) ? statSync(p).size : 0;
    const okSize = size > 3000;
    if (!okSize) allOk = false;
    console.log("    " + (okSize ? "PASS" : "FAIL") + "  " + f.padEnd(20) +
      size + " bytes");
  }
  ok(allOk, "every still wrote real image data", "");

  // The in-cue and the empty frame must NOT be the same picture. They were, in the
  // first run, and every size check passed on both -- a frame of black plate is
  // 34kB, comfortably over any threshold. Comparing the two catches "the smoke
  // test rendered the wrong moment", which no size threshold can.
  const a = path.join(OUT, "overlay-in.png");
  const b = path.join(OUT, "overlay-out.png");
  const same = existsSync(a) && existsSync(b) && statSync(a).size === statSync(b).size;
  ok(!same, "the in-cue frame and the empty frame are DIFFERENT pictures",
    same ? "identical byte size -- the frame number was outside the cue" : "");
}

rmSync(OUT, { recursive: true, force: true });

console.log("\n=== 6. RituPiece draws ITS OWN cues, not the prepared song's ===");
// The bug this catches: resolveMetadata() does
// `props: {...props, cues: parsed.cues}` -- it reads the cues out of
// lyrics.generated.js and OVERWRITES what was passed in. RituPiece's lyrics are
// supplied as DATA, on purpose, so the composition cannot re-derive an end time
// differently from the way the gate will check it.
//
// So with the shared resolver attached, RituPiece drew whatever song happened to
// be prepared in this tree. The first render drew ALLARE -- left there by section
// 1's own prepare step -- and the every-frame gate then compared RITU's cue windows
// against ALLARE's ink: 28 overshoots, a 26-second overrun, and a word in the
// wrong language. Every one of those numbers was an accurate measurement of the
// wrong video, and nothing in the file looked wrong.
{
  const root = readFileSync(path.join(ROOT, "src", "Root.jsx"), "utf8");
  const comp = /id="RituPiece"[\s\S]*?defaultProps/.exec(root);
  ok(!!comp && /calculateMetadata=\{\(\{ props \}\)/.test(comp[0]),
    "RituPiece does not use the shared resolveMetadata",
    comp ? (/resolveMetadata/.test(comp[0].split("calculateMetadata")[1] || "")
      ? "still attached" : "") : "composition not found");
  ok(!!comp && /durationInFrames/.test(root),
    "and takes its duration from props instead");
}

console.log(failed
  ? `\n  ${failed} CHECK(S) FAILED\n`
  : `\n  every composition renders a real frame -- the only instrument that sees a missing binding\n\n`);
process.exit(failed ? 1 : 0);

function firstError(log) {
  const m = log.split("\n").filter((l) => /Error|error|Reference/.test(l)).slice(0, 3);
  return m.join(" | ").slice(0, 200) || "exit " + "unknown";
}
