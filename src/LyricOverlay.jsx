import React from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig, delayRender, continueRender } from "remotion";
import { styleFor, jitterFor, positionFor, sizeFor, seededRandom, hashString } from "./animations.js";
import { buildMixPlan } from "./mix.js";
import { widthEm } from "./width-model.mjs";
import { wordTimings } from "./word-timing.js";
import { anchorsForCue } from "./beats.js";
import { splitGraphemes, letterSizePct } from "./letters.js";
// Per-word and per-letter COLOUR (src/color.js). Separate from the depth layers
// because colour is not a transform and, unlike them, takes no frame time at all
// -- it is assigned from a seed and stays, so it cannot put a word on screen
// after its line ended. The ranges are bounded for the Add/Screen overlay; see
// the note at the top of color.js for why full-spectrum is not "more colourful".
import {
  wordColor, letterColor, lineColor, gradientCss, levelHasLetterColor,
  levelTintsGlow, COLOR_LEVELS,
} from "./color.js";
// The cut-paper look: each word a clipping at its own angle, with a torn edge.
import {
  wordCut, tearBar, letterCut, wordCutTransform, CUT_LEVELS,
} from "./cut.js";
// The typed-on reveal. Its delay chain is fitted to the cue's own span for the
// same reason `sequence` is -- a letter still arriving at the line's end is the
// lingering-lyric bug.
import {
  typingPlan, fitDelay, typingAt, levelIsLetterwise, TYPE_LEVELS,
} from "./typing.js";
import { buildMotionPlan, cueMotion, motionParams, travelBudget, wordMotion, MOTION_LEVELS } from "./motion.js";
// The seven composition layers: tracking, baseline drift, arc, coupled depth,
// the sequenced reveal, chromatic offset and audio-keyed glow. Separate from
// motion.js because those vary how a line ARRIVES; these change how it is
// COMPOSED. See depth.js for the shirorekha rules and the sequencing
// compression that keeps a delayed word from outliving its line.
import {
  tracking as trackFor, baseline as baseFor, arc as arcFor, depth as depthFor,
  sequence, clampedSequence, chainBudget, sequenceStep as seqStep, chromatic as chromaFor,
  pulseGlow as glowFor, wordDepthStyle, DEPTH_LEVELS,
} from "./depth.js";
import { TitleCard } from "./TitleCard.jsx";
import { AUDIO_FILE, LEGACY_FONT_FILE, LEGACY_FONT_FAMILY, FONT_FILE, FONT_FAMILY_NAME } from "./lyrics.generated.js";

// Two ways a font gets here, and the difference between them is the whole
// point of this file.
//
//   FONT_FILE       a local .ttf registered under a name we choose. Used for
//                   BOTH kinds of font, because the CSS font-family stack
//                   cannot name a font that is not installed, and a font file
//                   on disk is not installed.
//   LEGACY_FONT_FILE the same thing, but the lyrics have already been
//                   transcoded to Preeti key sequences, so this is a font whose
//                   text is NOT the Devanagari in the .lrc.
//
// FONT_FILE is the interesting one: it is how a distinctive Devanagari face is
// used WITHOUT a layout file. The "custom font" look does not require a legacy
// font -- it requires a typeface that is not the system default. There are 58
// Unicode Devanagari fonts in nepali-legacy-fonts, many of them display faces,
// and a Unicode font is handed the lyrics unchanged, so there is no key layout
// that can render the wrong letters. A legacy font is the only thing that
// carries that risk, and it is the only thing that needs transcoding.
if (FONT_FILE) {
  const handle = delayRender(`font: ${FONT_FAMILY_NAME}`);
  const face = new FontFace(
    FONT_FAMILY_NAME,
    `url('${staticFile("fonts/" + FONT_FILE)}') format('truetype')`,
    {}
  );
  face
    .load()
    .then((loaded) => {
      document.fonts.add(loaded);
      continueRender(handle);
    })
    .catch((err) => {
      // A font that will not load renders the fallback, which is a valid-looking
      // video in the wrong typeface. Say so: the frame is otherwise fine and
      // nothing else reports it.
      console.error(`Font failed to load: ${FONT_FAMILY_NAME} (${FONT_FILE})`, err);
      continueRender(handle);
    });
}

if (LEGACY_FONT_FILE) {
  // Legacy Preeti-era fonts (AMS/Ananda/Abhinav): load the actual .ttf through
  // the FontFace API -- a bare CSS font-family cannot name these fonts reliably
  // across Chromium sandbox profiles, but explicit bytes always register. The
  // FILE is copied into public/fonts by render.mjs; text arrives pre-converted
  // to Preeti key sequences (scripts/lrc_legacy.py), which these fonts map to
  // their real Devanagari glyphs.
  const handle = delayRender(`legacy font: ${LEGACY_FONT_FAMILY}`);
  const face = new FontFace(
    LEGACY_FONT_FAMILY,
    `url('${staticFile("fonts/" + LEGACY_FONT_FILE)}') format('truetype')`,
    { weight: "400" }
  );
  face
    .load()
    .then((loaded) => {
      document.fonts.add(loaded);
      continueRender(handle);
    })
    .catch((err) => {
      console.error(`Legacy font failed: ${LEGACY_FONT_FAMILY}`, err);
      continueRender(handle);
    });
}

const FONT_FAMILY =
  LEGACY_FONT_FAMILY ||
  // A --font-file is registered under FONT_FAMILY_NAME and must lead the stack,
  // or the CSS fallback below wins and the render quietly uses the system font
  // instead -- which looks like the flag was ignored rather than like an error.
  (FONT_FILE ? '"' + FONT_FAMILY_NAME + '", ' : "") +
  (process.env.LYRIC_FONT ||
    '"Noto Sans Devanagari", "Nirmala UI", "Microsoft New Tai Lue", "Segoe UI", sans-serif');

// Legacy Preeti text is visual-order ASCII: applying fontWeight 700 makes
// Chromium synthesize fake bold (double-draw smear), and letter-spacing
// breaks the pre-base matra positioning that lives in the glyph order.
const legacyTextStyle = LEGACY_FONT_FAMILY ? { fontWeight: 400 } : {};

// -- random font size (--size-mode phrase|word) -----------------------------
//
// WORD granularity is safe; LETTER granularity is not. Devanagari's
// shirorekha -- the horizontal headline running across the top of a word --
// is one continuous bar. Give two letters of the same word different sizes
// and the bar visibly snaps in half. At a word boundary there is already a
// natural gap in the headline, so sizing whole words changes nothing about
// how the glyphs join. The Preeti key text is safe too: lrc_legacy.py splits
// and rejoins on spaces, so word boundaries survive the conversion.
//
// Word multipliers are expressed as PERCENTAGES of the parent, not pixels,
// so the outgoing line can still be shrunk as a whole (it renders at 0.62 /
// 0.8 of the current size) without its words escaping that scale.
function wordSpans(text, seed, index, amount) {
  return text.split(" ").map((w, i) => (
    <React.Fragment key={i}>
      {i > 0 ? " " : null}
      <span style={{ fontSize: (sizeFor(seed, index, amount, "w" + i) * 100).toFixed(2) + "%" }}>
        {w}
      </span>
    </React.Fragment>
  ));
}

const clamp01 = (x) => Math.min(Math.max(x, 0), 1);

// The pixel size a word is ACTUALLY being drawn at, given its fontSize
// percentage and the line's base. The cut effect's lift and its torn edge are
// in real px, so they need the real number -- "0.055 of what?" is not a
// question a transform can answer.
const fontSizeOf = (pct, base) => {
  const n = pct ? parseFloat(String(pct).replace("%", "")) : 100;
  return (base * (Number.isFinite(n) ? n : 100)) / 100;
};
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const easeIn = (t) => Math.pow(clamp01(t), 3);

const ENTER = 0.34; // seconds
const EXIT = 0.28;

// -- word-by-word animation (--word-anim) ------------------------------------
//
// Each word gets its own start time (src/word-timing.js) and animates in when
// it arrives, so a line is built on screen word by word instead of appearing
// all at once. Words already sung STAY visible -- the line is not wiped after
// the fact, because the audience needs to read the whole line while the next
// one is already coming in.
//
// The per-word style is picked from the same seeded pool as line styles, keyed
// on (seed, cueIndex, wordIndex), so it is deterministic like everything else
// here. The word index is part of the key so words in one line do not all get
// the same animation.
function wordStyleFor(seedText, cueIndex, wordIndex, force) {
  return styleFor(`${seedText}#${cueIndex}`, wordIndex, force);
}

// The effect NAMES live in src/anim-pools.mjs, because render.mjs has to
// validate --word-anim / --letter-anim against the same list this file
// implements. When they were declared here, the two could not see each other and
// every newly added effect was rejected by the validator before it could ever
// render.
//
// IMPORTED, then re-exported: a bare `export { X } from "..."` does not create
// a local binding, so anything in THIS file that refers to WORD_ANIMS fails with
// "WORD_ANIMS is not defined" at render time -- which is exactly what happened.
import {
  WORD_ANIMS, LETTER_ANIMS, WORD_MIX_POOL,
} from "./anim-pools.mjs";
export { WORD_ANIMS, LETTER_ANIMS, WORD_MIX_POOL };

/** The effect for word `i` of cue `index`, seeded so it is reproducible. */
export function wordAnimFor(mode, seed, index, i) {
  if (mode !== "mix") return mode;
  const rnd = seededRandom(hashString("wordmix:" + String(seed)) + index * 40503 + i * 7919);
  let pick = WORD_MIX_POOL[Math.floor(rnd() * WORD_MIX_POOL.length) % WORD_MIX_POOL.length];
  // No two neighbours the same: re-pick once. A repeat here is a stutter in
  // the middle of a line, which is the most visible place for one.
  return pick;
}

/**
 * Visual state of one word at time t.
 *
 * @param {string} mode   off | reveal | karaoke | pulse
 * @param {number} start  when this word begins
 * @param {number} end    when the next word begins (== cue end for the last)
 * @param {number} t      current time in seconds
 * @param {object} st     line-level style, reused so the word matches the line
 */
export function wordState(mode, start, end, t, st) {
  if (mode === "off" || !st) return { opacity: 1, transform: "" };

  // st carries the line's shadow/filter, which each word should keep; only the
  // animated properties are overridden below.
  const p = clamp01((t - start) / Math.max(0.05, end - start));

  if (mode === "reveal") {
    // Rise into place quickly, then hold for the rest of the slot.
    const inE = easeOut(clamp01((t - start) / 0.22));
    return { ...st, opacity: inE, transform: `translateY(${(1 - inE) * 14}px)` };
  }

  // ---- the expansion -------------------------------------------------------
  // All of these are WHOLE-WORD transforms. Every letter in the word moves
  // together, so the shirorekha stays continuous -- which is the rule the
  // per-letter layer cannot break (see the note above LETTER_ANIMS).
  const q = clamp01((t - start) / 0.24);
  const e = easeOut(q);
  const k = 1 - e;

  if (mode === "flip") {
    return {
      ...st,
      opacity: Math.min(1, e * 1.5),
      transform: `perspective(700px) rotateX(${(-k * 70).toFixed(2)}deg) scale(${(0.9 + 0.1 * e).toFixed(4)})`,
    };
  }
  if (mode === "swing") {
    // A counter-swing on landing is what separates "swung" from "rotated".
    const arc = Math.sin(e * Math.PI) * 10;
    return {
      ...st,
      opacity: e,
      transform: `rotate(${(-k * 14 + arc * 0.4).toFixed(2)}deg) translateY(${(k * 12).toFixed(2)}px)`,
    };
  }
  if (mode === "drop") {
    // A real bounce: down fast, up, settle. Not an ease with a different name.
    const b = Math.abs(Math.sin(e * Math.PI * 2)) * (1 - e) * 18;
    return {
      ...st,
      opacity: Math.min(1, e * 2),
      transform: `translateY(${(-k * 30 + b).toFixed(2)}px)`,
    };
  }
  if (mode === "zoom") {
    return {
      ...st,
      opacity: Math.min(1, e * 1.4),
      transform: `scale(${(1.45 - 0.45 * e).toFixed(4)})`,
    };
  }
  if (mode === "spin") {
    const turns = (1 - e) * 1.6;
    return {
      ...st,
      opacity: Math.min(1, e * 1.6),
      transform: `rotate(${(turns * 180).toFixed(2)}deg) scale(${(0.8 + 0.2 * e).toFixed(4)})`,
    };
  }
  if (mode === "cascade") {
    // Slower than `reveal` and from further below, so a run of them reads as a
    // wave down the line rather than five identical hops.
    const c = easeOut(clamp01((t - start) / 0.38));
    return { ...st, opacity: c, transform: `translateY(${((1 - c) * 26).toFixed(2)}px)` };
  }
  if (mode === "glow") {
    return {
      ...st,
      opacity: 0.2 + 0.8 * e,
      textShadow: `0 0 ${((1 - e) * 18).toFixed(1)}px rgba(255,255,255,${((1 - e) * 0.6).toFixed(2)})`,
    };
  }
  if (mode === "slide-left") {
    return { ...st, opacity: e, transform: `translateX(${(-k * 26).toFixed(2)}px)` };
  }
  if (mode === "slide-right") {
    return { ...st, opacity: e, transform: `translateX(${(k * 26).toFixed(2)}px)` };
  }
  if (mode === "wobble") {
    // Two decaying oscillations, then still. Reads as something said rather
    // than something placed.
    const decay = Math.max(0, 1 - q * 1.6);
    return {
      ...st,
      opacity: Math.min(1, e * 2),
      transform: `translateX(${(Math.sin(q * 18) * 5 * decay).toFixed(2)}px) rotate(${(Math.sin(q * 18) * 1.6 * decay).toFixed(2)}deg)`,
    };
  }

  if (mode === "karaoke") {
    // Brightest at the moment it lands, settling back after: this is what makes
    // the eye follow along the line.
    const inE = easeOut(clamp01((t - start) / 0.18));
    const hot = 1 - p;
    return {
      ...st,
      opacity: inE,
      textShadow: `0 0 ${(10 + hot * 26).toFixed(1)}px rgba(255,255,255,${(0.35 + hot * 0.6).toFixed(2)})`,
    };
  }

  if (mode === "pulse") {
    // A small scale pop as the word lands, nothing after.
    const inE = easeOut(clamp01((t - start) / 0.2));
    return {
      ...st,
      opacity: inE,
      transform: `scale(${(0.9 + 0.1 * inE).toFixed(4)})`,
    };
  }

  return { ...st, opacity: 1, transform: "" };
}

/**
 * Render a cue's words as spans, each animated on its own start time.
 *
 * The line-level style `st` is deliberately NOT applied to the words: it holds
 * the whole-line entrance/exit and a `scale()` in it would fight the per-word
 * transform. The caller keeps it on the wrapping element.
 */
function animatedWords(text, opts) {
  const { seed, index, anim, sizeMode, sizeVar, t, cueTime, cueEnd,
          letterAnim, letterSizeVar, anchors, motionLevel, motionId, motionPrm,
          sizeDrift, depthLevel = "off", amplitude = null,
          colorMode = "off", colorHue = 210, colorScheme = "analogous", accent = 1,
          cut = "off", type = "off", stroke = 0, strokeColor = "#000000",
          baseSize = 105, wordFill } = opts;

  // The cue's own span and start, needed by the composition layers. A cue's
  // span is the budget every layer has to finish inside -- the same budget
  // motion.js works from, for the same reason: a line still travelling at its
  // end is the bug the ends file exists to prevent.
  const cueSpan = Math.max(0.001, cueEnd - cueTime);
  const cueStartTime = cueTime;
  // anchors come from src/beats.js when a beats.json was passed: word starts
  // quantize to the beat grid, ends stay distributed. undefined = the old
  // even distribution, unchanged.
  const words = wordTimings({ text, time: cueTime, end: cueEnd }, { anchors, fill: wordFill });
  if (words.length === 0) return text;

  const amount = Number(sizeVar) || 0;

  // --type: the typed-on reveal, fitted to THIS cue's span.
  //
  // Both of these are computed ONCE per line, not per word, because the typing
  // stagger runs across the whole line -- word 4's letters start after word 1's
  // have finished. Computing a per-word chain would retype every word in unison,
  // which is `word` level at best and not typing at all at worst.
  const typeActive = TYPE_LEVELS.includes(type) && type !== "off";
  const totalLetters = typeActive
    ? words.reduce((n, w) => n + splitGraphemes(w.text).length, 0)
    : 0;
  const tPlan = typeActive ? typingPlan(type, words.length, totalLetters) : null;
  const tFit = tPlan ? fitDelay(type, tPlan, cueSpan) : null;
  // How many LETTERS precede word i, so the per-letter delay can continue across
  // the word boundary instead of restarting. Without this the last letter of one
  // word and the first of the next land on the same frame.
  const lettersBefore = [];
  {
    let n = 0;
    for (const w of words) { lettersBefore.push(n); n += splitGraphemes(w.text).length; }
  }

  return words.map((w, i) => {
    // `mix` deals a different effect to each word, so a line is five
    // gestures in sequence rather than one repeated five times.
    const mode = wordAnimFor(anim, seed, index, i);
    const ws = wordState(
      mode,
      w.start,
      w.end,
      t,
      mode === "off" ? null : cueStyle(wordStyleFor(seed, index, i), 1, 0, 0)
    );
    // When only the letter layer is active there is no per-word animation, so
    // the word span must not carry the line's own opacity/transform or the
    // letters would be animated on top of a second, conflicting transform.
    const pct =
      sizeMode === "word"
        ? (sizeFor(seed, index, amount, "w" + i) * 100).toFixed(2) + "%"
        : null;

    // --motion: a per-WORD offset that decays as the word arrives, so the line
    // is still assembling itself while its own entrance is finishing. COMPOSED
    // with wordState's transform as a string rather than assigned over it: two
    // writes to `transform` on one span is gotcha 12, and here both writers are
    // wanted, so the second one has to be appended to the first, not replace it.
    const wm = motionId ? wordMotion(motionId, t - w.start, motionPrm, motionLevel) : "";
    // --size-drift: the word GROWS as it is sung, then settles back. A whole-word
    // scale, so the shirorekha is untouched. The amplitude tapers as the word
    // approaches the end of its slot, so a word that is still drifting when its
    // line ends cannot be caught mid-grow at the fade-out.
    let drift = "";
    const driftAmt = Number(sizeDrift) || 0;
    if (driftAmt > 0) {
      const age = t - w.start;
      const dur = Math.max(0.12, (w.end - w.start) * 0.6);
      const g = age <= 0 ? 0 : Math.sin(Math.min(1, age / dur) * Math.PI) * driftAmt;
      if (g > 0.0005) drift = `scale(${(1 + g).toFixed(4)})`;
    }
    // Three writers to one `transform`, so they are JOINED as a string in a
    // deliberate order (motion offset, then drift, then the word's own effect)
    // rather than assigned over each other. Order matters: rightmost applies
    // first, so the word's own entrance stays the outermost gesture.
    const transform = [wm, drift, ws.transform].filter(Boolean).join(" ");

    // --depth: the composition layers. Applied to the WORD span, because
    // tracking has to live on the gap between words (see depth.js) and the rest
    // are whole-word transforms, which keep the shirorekha continuous.
    //
    // The word's own start is what `sequence` shifts, so everything downstream
    // of the delay sees the DELAYED time. That is the point -- a sequenced line
    // reads as a chain of causes -- but it is also why the delay is fitted to
    // the cue's span before anything else asks for a time.
    const nWords = words.length;
    // --depth's sequenced reveal delays each word until the previous one has
    // begun, but that delay is added to a word slot which may ALREADY be at the
    // very end of the cue -- wordTimings() fills slots by sung character count,
    // so the last word of a long line lands late by construction. Unclamped, the
    // two add up and the last word begins after its cue ended, which is the
    // "some words disappear" report. clampedSequence() is the single source of
    // truth for that; the arithmetic and the measurement live in depth.js and
    // check_depth.mjs rather than being restated here.
    // The chain's budget reserves a readable window for the LAST word, so the
    // slot of the final word is needed before the chain can be sized -- hence the
    // second lookup rather than the one in hand. It is the last word that is
    // tightest: its slot is placed last and the chain delays it the most, and
    // nothing else in the line is competing for those same two effects.
    const lastSlot = words[nWords - 1].start - cueStartTime;
    const seq = clampedSequence(
      depthLevel, i, nWords, cueSpan, w.start - cueStartTime,
      chainBudget(cueSpan, wordFill, lastSlot)
    );
    const wStart = w.start + seq;
    const wAge = t - wStart;
    // progress through the word's own (delayed) slot, for the depth curve
    const wProg = w.end > wStart ? clamp01((t - wStart) / (w.end - wStart)) : 0;

    // How late THIS word's own arrival is, relative to the start of the line.
    //
    // This is the number that makes the typed-on reveal correct, and it exists
    // because the chain is indexed by a letter's position in the whole line while
    // being evaluated against each word's own start. Those are two different
    // clocks. Words are spread across the cue span AND `--depth`'s sequenced
    // reveal delays each until the previous one has begun, so the last word can
    // start seconds after the line did. Adding the line-wide letter index to that
    // late start scheduled the last word's FIRST letter nearly a second after the
    // word itself had arrived, and its LAST letter past the cue's end entirely --
    // measured on Kali Kali, 15 of 48 cues, worst +0.16s.
    //
    // Subtracting the lag is the whole fix: a letter's absolute time becomes
    // max(wordStart, lineIndex * step). The chain still sweeps the line in order
    // at the same pace; no letter is ever scheduled before the word holding it is
    // on screen. The LOOK is untouched -- same clip, same easing, same step --
    // only the anchor moved.
    //
    // It also explains why the every-frame scan passed while this was broken. The
    // scan measures INK against the cue window, and a letter clipped to zero
    // width draws none -- so an unfinished word is INVISIBLE rather than lingering,
    // and there is nothing past the cue's end for the scan to find. The bug was a
    // MISSING word; the gate catches a word that stays too long.
    const typeLag = wStart - cueStartTime;

    const dTrack = depthLevel === "off" ? 0 : trackFor(depthLevel, wAge, Math.max(0.001, w.end - wStart));
    const dBase = depthLevel === "off" ? 0 : baseFor(depthLevel, t - cueStartTime, cueSpan, seed, index);
    const dArc = depthLevel === "off" ? { y: 0, rot: 0 }
      : arcFor(depthLevel, nWords > 1 ? i / (nWords - 1) : 0.5, wProg);
    const dDep = depthFor(depthLevel, wProg);
    // "speed" is how far through its entrance the word is, used only to gate the
    // chromatic offset: zero when still, so a permanent fringe never appears.
    const dChroma = chromaFor(depthLevel, 1 - wProg);
    const dGlow = depthLevel === "off" ? 0 : glowFor(depthLevel, amplitude, t - cueStartTime, cueSpan);

    // --color-mode: this word's colour, from the line's SCHEME so the words in a
    // line are related hues rather than six unrelated ones, then drawn from the
    // seed and left alone. No `t` anywhere in it, which is the whole reason
    // colour cannot introduce a lingering lyric.
    // Declared BEFORE depthStyle because the glow is tinted with it.
    const wc = wordColor(colorMode, seed, colorHue, index, i, { scheme: colorScheme, accent });
    const colorStyle = wc ? { color: wc.css } : {};

    const depthStyle = depthLevel === "off" ? {} : wordDepthStyle({
      tracking: dTrack, baseline: dBase, arc: dArc, depth: dDep,
      chromatic: dChroma, glow: dGlow,
      // The glow takes the word's own colour when colour is on, so the halo and
      // the glyph agree. Null otherwise, which leaves the white glow exactly as
      // it was -- so a render without --color-mode is unchanged by this file.
      tint: levelTintsGlow(colorMode) && wc ? wc.rgb : null,
    });

    // --cut: this word as a separate clipping. The transform is JOINED to the
    // other three writers rather than assigned over them -- that is gotcha 12,
    // and it has now come up four times in this file.
    const cutOn = CUT_LEVELS.includes(cut) && cut !== "off";
    const wcCut = cutOn ? wordCut(cut, seed, index, i, fontSizeOf(pct, baseSize)) : null;
    const cutT = wcCut ? wordCutTransform(wcCut) : "";
    const tear = cutOn ? tearBar(cut, seed, index, i, fontSizeOf(pct, baseSize)) : null;

    // The gap BETWEEN words carries the tracking. Letter spacing inside a word
    // would separate one syllable's letters and snap the shirorekha, so it is
    // never applied there -- the limitation is deliberate, not an oversight.
    const gapStyle = dTrack
      ? { marginLeft: (dTrack * 0.5).toFixed(3) + "em" }
      : null;

    return (
      <React.Fragment key={i}>
        {i > 0 ? <span style={gapStyle || undefined}>&nbsp;</span> : null}
        <span
          style={{
            // inline-block so a scale() has its own box to act on; on a plain
            // inline span the transform would apply to the whole line.
            display: "inline-block",
            // relative ONLY when there is a torn edge, so a render with --cut off
            // builds exactly the nodes it built before this existed.
            ...(tear ? { position: "relative", paddingBottom: "0.16em" } : {}),
            ...(pct ? { fontSize: pct } : {}),
            ...colorStyle,
            ...ws,
            // Four writers to one `transform` now: the word's own entrance, the
            // motion offset, the size drift, and the cut. They are JOINED in a
            // deliberate order rather than assigned over each other -- gotcha 12,
            // and the cut is the fourth writer to arrive here. The word's own
            // entrance must stay RIGHTMOST because rightmost applies first, which
            // makes it the outermost gesture.
            ...([wm, drift, cutT, ws.transform].filter(Boolean).length
              ? { transform: [wm, drift, cutT, ws.transform].filter(Boolean).join(" ") }
              : {}),
            ...depthStyle,
          }}
        >
          {/*
            The torn edge lives on its OWN absolutely-positioned child, never as a
            clip-path on this span. That is not a style preference: clip-path
            REMOVES ink, and the ink in the bottom of a word is the shirorekha --
            so clipping the word to a torn shape would nibble the headline bar
            this whole file is careful about. As a sibling painted behind the
            text it removes nothing.
          */}
          {tear ? (
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: "0.34em",
                zIndex: -1,
                ...tear,
              }}
            />
          ) : null}
          {letterNodes(w.text, {
            seed, wordIndex: index, letterIndexBase: i,
            letterSizeVar, letterAnim, t, wordStart: wStart, wordEnd: w.end,
            // The word's colour goes down so each letter can step away from it.
            colorMode, colorHue, colorScheme, cueIndex: index, wordOrdinal: i,
            wordColorObj: wc,
            // --cut and --type both act per letter, inside the word.
            cut, type, typeFit: tFit, typePlan: tPlan, letterBase: lettersBefore[i],
            typeLag, typeSpan: cueSpan,
          })}
        </span>
      </React.Fragment>
    );
  });
}

// -- per-letter layer (--letter-anim, --letter-var) --------------------------
//
// Sits INSIDE each word span. Letters are grapheme clusters, not codepoints,
// so conjuncts and pre-base matras survive intact -- see src/letters.js for why
// that matters and what breaks otherwise.
//
// Two independent knobs:
//
//   --letter-anim  per-letter animation. Safe at any strength, because a
//                  letter can appear without changing its size.
//   --letter-var   per-letter SIZE. Clamped to LETTER_SIZE_CAP = 0.03 (and
//                  again in render.mjs) because the shirorekha is continuous
//                  across a word: past that, two letters at different sizes
//                  visibly snap the headline in half. Measured:
//                  0 = continuous, 0.03 = continuous but letters differ,
//                  0.05 = starts to separate, 0.08 = clearly broken. (A
//                  comment here used to claim 0.12, contradicting both the
//                  constant and render.mjs -- gotcha 29's shape.)
//
// WHAT A PER-LETTER EFFECT MAY TOUCH
// ---------------------------------
// SAFE, and the new effects below stick to these:
//   opacity, translateX/Y, rotate, blur, clipPath, textShadow (glow)
// NOT SAFE, and deliberately not added:
//   scale, fontSize beyond 0.03
//
// A per-LETTER scale moves that letter's shirorekha relative to its
// neighbours -- the exact damage per-letter SIZE does, reached by another road.
// Whole-WORD scale is fine: every letter moves together so the headline stays
// continuous. That is why the word pool can scale freely and this one cannot.
// The names and this reasoning live in src/anim-pools.mjs so render.mjs can
// validate against the same list; LETTER_ANIMS is re-exported above.

/** Visual state of one letter at time t, relative to its word's arrival. */
export function letterState(mode, elapsed, letterIndex) {
  if (mode === "off") return {};

  // Each letter trails the one before it slightly, so a word reads as
  // "unrolling" rather than every letter popping at once.
  const delay = letterIndex * 0.035;
  const p = clamp01((elapsed - delay) / 0.20);
  const inE = easeOut(p);

  if (mode === "fade") return { opacity: inE };
  if (mode === "rise") {
    return { opacity: inE, transform: `translateY(${(1 - inE) * 10}px)` };
  }
  if (mode === "pop") {
    return {
      opacity: inE,
      transform: `scale(${(0.72 + 0.28 * inE).toFixed(4)})`,
    };
  }
  if (mode === "wipe") {
    // Clip each letter in from its own left edge, left to right.
    return { opacity: 1, clipPath: `inset(0 ${((1 - inE) * 100).toFixed(1)}% 0 0)` };
  }
  if (mode === "drop") {
    return { opacity: inE, transform: `translateY(${(-(1 - inE) * 26).toFixed(2)}px)` };
  }
  if (mode === "slide-left") {
    return { opacity: inE, transform: `translateX(${(-(1 - inE) * 18).toFixed(2)}px)` };
  }
  if (mode === "slide-right") {
    return { opacity: inE, transform: `translateX(${((1 - inE) * 18).toFixed(2)}px)` };
  }
  if (mode === "tilt") {
    return { opacity: inE, transform: `rotate(${(-(1 - inE) * 16).toFixed(2)}deg)` };
  }
  if (mode === "tumble") {
    // The long way round, with a little spin left on landing.
    const k = 1 - inE;
    return {
      opacity: inE,
      transform: `rotate(${(-k * 120 + Math.sin(p * Math.PI) * 14).toFixed(2)}deg)`,
    };
  }
  if (mode === "blur-in") {
    return { opacity: Math.min(1, inE * 1.4), filter: `blur(${((1 - inE) * 5).toFixed(2)}px)` };
  }
  if (mode === "glow-in") {
    // Dim and unlit, then fully lit: on a white-on-black overlay this reads as
    // the word switching on rather than merely appearing.
    const k = 1 - inE;
    return {
      opacity: 0.15 + 0.85 * inE,
      textShadow: `0 0 ${(k * 14).toFixed(1)}px rgba(255,255,255,${(k * 0.5).toFixed(2)})`,
    };
  }
  if (mode === "unfurl") {
    return { opacity: 1, clipPath: `inset(${(-(1 - inE) * 100).toFixed(1)}% 0 0 0)` };
  }
  return {};
}

/**
 * Render one word's letters as spans. Returns the plain string when every letter
 * feature is off, so a normal render builds no extra nodes.
 *
 * --color-mode joins size and animation in that decision. Colour is on the
 * ALLOWED side of the shirorekha rule (it changes no glyph's size or position --
 * see the note above wordDepthStyle), but a letter still needs its own SPAN to
 * carry a colour, so leaving this guard untouched would silently drop per-letter
 * colour for every render that did not also ask for per-letter size.
 */
function letterNodes(text, opts) {
  const { seed, wordIndex, letterIndexBase, letterSizeVar, letterAnim, t,
          wordStart, colorMode = "off", colorHue = 210, colorScheme = "analogous",
          cueIndex = 0, wordOrdinal = 0, wordColorObj = null,
          cut = "off", type = "off", typeFit = null, typePlan = null,
          letterBase = 0, typeLag = 0, typeSpan = 0 } = opts;
  const sizeOn = Number(letterSizeVar) > 0;
  const animOn = letterAnim && letterAnim !== "off";
  const colorLettersOn = levelHasLetterColor(colorMode) && !!wordColorObj;
  const cutLettersOn = cut === "letter";
  const typeOn = !!typePlan && !!typeFit;
  if (!sizeOn && !animOn && !colorLettersOn && !cutLettersOn && !typeOn) return text;

  const letters = splitGraphemes(text);
  // Nothing to vary in a single grapheme, and animating it would be a no-op.
  if (letters.length < 2) return text;

  const elapsed = t - (wordStart ?? t);
  // letterIndexBase keeps the seed distinct from the word's own key, so the
  // first letter of word 3 does not reuse word 0's values.
  const base = wordIndex * 1000 + letterIndexBase * 100;

  return letters.map((ch, i) => {
    const style = {};
    if (sizeOn) {
      const pct = letterSizePct(letterSizeVar, seed, wordIndex, base + i);
      if (pct) style.fontSize = pct;
    }
    // Per-letter colour. letterColor returns the WORD's colour unchanged when the
    // level has no per-letter step, so this is safe to call whenever colour is on
    // and costs nothing when it is not.
    if (colorLettersOn) {
      const lc = letterColor(colorMode, seed, colorHue, cueIndex, wordOrdinal, i, wordColorObj);
      if (lc) style.color = lc.css;
    }
    // --cut letter: ROTATION ONLY. No lift, no clip -- both cut the headline
    // bar, which is the whole limit on this effect. See src/cut.js.
    let cutTransform = "";
    if (cutLettersOn) {
      const cl = letterCut(cut, seed, cueIndex, wordOrdinal, i);
      if (cl) cutTransform = cl.transform;
    }
    // How late THIS word's own arrival is, relative to the start of the LINE. It is
    // computed in animatedWords() (where wStart is) and passed down through opts,
    // because letterNodes() has no wStart of its own.
    //
    // Subtracting it is what makes a letter's absolute time
    // max(wordStart, lineIndex * step) instead of the SUM of the two delays. See the
    // long note where it is computed -- including why the every-frame scan passed
    // while this was broken (the bug was a MISSING word, and the gate catches a
    // word that stays too long).
    const lag = Number(typeLag) || 0;

    if (typeOn) {
      const unitIndex = levelIsLetterwise(type)
        ? letterBase + i
        : wordOrdinal;
      const delay = Math.max(0, unitIndex * typeFit.step - lag);

      // The per-unit duration is ALSO clamped to the time this word has left in
      // the cue. The chain's own fit is computed from the LINE's start, so it
      // guarantees the chain fits -- but not that any single unit finishes inside
      // the cue, and a word can start very late. Kali Kali's
      // "मेरो मनमा हुन्छ हलचल" starts its last word at 2.70s of a 2.98s cue,
      // leaving 0.28s, while the `line` level asks each unit to take 0.55s: the
      // word began typing and was cut off before it finished.
      //
      // Clamped rather than compressed-with-the-chain, because the chain fit is
      // about the line and this is about one word's remaining time. And floored,
      // so a word starting at or after the cue's end gets a positive duration
      // rather than a negative one -- it simply never appears, which is correct.
      const dur = Math.min(typeFit.dur, Math.max(0.001, (typeSpan || 0) - lag));
      Object.assign(style, typingAt(type, delay, dur, elapsed));
    }
    if (animOn) Object.assign(style, letterState(letterAnim, elapsed, i));
    // The cut's rotation is COMPOSED with the letter animation's own transform,
    // never assigned over it: `letterState` may also produce a transform (rise,
    // drop, slide, tumble) and two writers to one key is gotcha 12. The letter's
    // own movement stays rightmost so it remains the outermost gesture.
    if (cutTransform) {
      const own = style.transform || "";
      style.transform = own ? `${own} ${cutTransform}` : cutTransform;
    }
    return (
      <span
        key={i}
        style={{
          display: "inline-block",
          ...style,
        }}
      >
        {ch}
      </span>
    );
  });
}

/** easeOutBounce -- the drop-bounce landing curve (standard formulation). */
function outBounce(x) {
  const n1 = 7.5625, d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
}

/**
 * Compute the visual state of one cue at time t.
 * Exported so the still/contact-sheet renderer can reuse it without React.
 *
 * p = 0..1 through the entrance, q = 0..1 through the exit, j = 0..1 jitter,
 * life = seconds since the cue started (drives the persistent-life styles;
 * omitted by callers that render a static still, which freezes them mid-air
 * at a harmless phase).
 */
export function cueStyle(style, p, q, j, life = 0) {
  // p = 0..1 through the entrance, q = 0..1 through the exit, j = 0..1 jitter
  const inE = easeOut(p);
  const outE = easeIn(q);
  const opacity = Math.min(inE, outE);
  const s = { opacity, transform: "", filter: "", clipPath: undefined };

  switch (style) {
    case "rise":
      s.transform = `translateY(${(1 - inE) * 44}px)`;
      break;
    case "pop":
      s.transform = `scale(${0.86 + 0.14 * inE})`;
      break;
    case "slide-left":
      s.transform = `translateX(${(1 - inE) * (90 + j * 50)}px)`;
      break;
    case "slide-right":
      s.transform = `translateX(${(1 - inE) * -(90 + j * 50)}px)`;
      break;
    case "zoom-through": {
      const z = 1.18 - 0.18 * inE;
      s.transform = `scale(${z})`;
      s.opacity = opacity * (0.65 + 0.35 * inE);
      break;
    }
    case "blur-in":
      s.filter = `blur(${(1 - inE) * (10 + j * 8)}px)`;
      s.transform = `scale(${0.97 + 0.03 * inE})`;
      break;
    case "typewriter": {
      // Wipe the text in by clipping from the left, with a slight ease so it
      // does not read as a hard mask.
      const w = 100 * inE;
      s.clipPath = `inset(0 ${(100 - w).toFixed(2)}% 0 0)`;
      break;
    }
    case "glow":
      // The reference-video look: white core with a soft bloom. Text-shadow
      // carries the glow; scale eases from slightly larger (light gathering).
      s.textShadow = `0 0 ${(18 + j * 14).toFixed(1)}px rgba(255,255,255,0.95), 0 0 ${(60 + j * 40).toFixed(1)}px rgba(255,255,255,0.55)`;
      s.transform = `scale(${(1.04 - 0.04 * inE).toFixed(4)})`;
      break;
    // -- choreographed entrances -------------------------------------------
    case "spring": {
      // Critically-damped-ish spring: starts small, overshoots ~8% and
      // settles. The exponential envelope keeps it deterministic per frame.
      const u = 1 - Math.exp(-5.5 * p);
      const over = Math.sin(p * Math.PI * 2.2) * Math.exp(-4 * p) * 0.18;
      s.transform = `scale(${(0.7 + 0.3 * u + over).toFixed(4)})`;
      break;
    }
    case "swing": {
      // Released off-centre like a hanging sign: drops in while rotating
      // home, with one small counter-swing baked into the easing tail.
      const rot = (1 - inE) * -(14 + j * 8) + Math.sin(p * 6.5) * (1 - p) * 4;
      s.transform = `translateY(${((1 - inE) * -34).toFixed(1)}px) rotate(${rot.toFixed(2)}deg)`;
      break;
    }
    case "flip-in":
      s.transform = `perspective(900px) rotateX(${((1 - inE) * -80).toFixed(1)}deg)`;
      s.opacity = Math.min(1, opacity * (0.4 + 0.6 * inE));
      break;
    case "float-up":
      s.transform = `translateY(${((1 - inE) * 30).toFixed(1)}px)`;
      s.filter = `blur(${((1 - inE) * 6).toFixed(1)}px)`;
      break;
    case "drop-bounce": {
      // Falls from above and bounces to rest (easeOutBounce on the fall).
      const drop = 1 - outBounce(clamp01(p * 1.15));
      s.transform = `translateY(${(drop * -74).toFixed(1)}px)`;
      break;
    }
    case "scale-up":
      s.transform = `scale(${(0.55 + 0.45 * (1 - Math.pow(1 - inE, 4))).toFixed(4)})`;
      break;
    case "letter-spread":
      // Arrives stretched wide and tightens into place (tracking-in feel).
      s.transform = `scaleX(${(1 + (1 - inE) * 0.38).toFixed(4)})`;
      break;
    case "line-wipe": {
      // A bottom edge rises and uncovers the line.
      const w = 100 * inE;
      s.clipPath = `inset(${(100 - w).toFixed(2)}% 0 0 0)`;
      break;
    }
    case "roll-in":
      s.transform = `rotate(${((1 - inE) * -170).toFixed(1)}deg) scale(${(0.3 + 0.7 * inE).toFixed(3)})`;
      s.opacity = Math.min(1, opacity * (0.55 + 0.45 * inE));
      break;
    case "zoom-fade":
      // Dolly-in: starts large and near, recedes to rest while fading up.
      s.transform = `scale(${(1.3 - 0.3 * inE).toFixed(4)})`;
      s.opacity = opacity * (0.35 + 0.65 * inE);
      break;
    // -- persistent-life: keep moving while the line holds -------------------
    case "breathe":
      s.transform = `scale(${(1 + 0.025 * Math.sin((life * 2 * Math.PI) / 3.2)).toFixed(4)})`;
      break;
    case "glow-pulse": {
      const a = 0.5 + 0.5 * Math.sin((life * 2 * Math.PI) / 2.8 + j * 2);
      s.textShadow = `0 0 ${(14 + 10 * a).toFixed(1)}px rgba(255,255,255,0.95), 0 0 ${(46 + 40 * a).toFixed(1)}px rgba(255,255,255,0.5)`;
      s.transform = `scale(${(1.03 - 0.03 * inE).toFixed(4)})`;
      break;
    }
    case "pendulum":
      s.transform = `rotate(${(1.3 * Math.sin((life * 2 * Math.PI) / 4.6 + j * 3)).toFixed(3)}deg)`;
      break;
    case "fade":
    default:
      break;
  }
  return s;
}

export const LyricOverlay = ({ cues, title, band, seed, style, fontSize, color, shadow, position, background, mode, sizeMode, sizeVar, wordAnim, letterAnim, letterVar, titleCard, titleCardOutro, mixBlock, mixPlanSpec, widthModel, beats, beatTol, motion, motionBlock, sizeDrift, depth, colorMode, colorHue, colorScheme, colorGradient, colorAccent, cut, type, stroke, strokeColor, scanlines, scanlineAlpha, amplitudes, wordFill }) => {
  // Per-cue audio amplitude, 0..1, for the glow layer. Read from the analysis
  // render.mjs produced; null when there is none, and pulseGlow falls back to a
  // slow breath rather than to nothing.
  const cueAmplitude = (i) => (Array.isArray(amplitudes) && amplitudes[i] != null ? amplitudes[i] : null);
  const frame = useCurrentFrame();
  const { fps, width: W_FRAME, height: H_FRAME } = useVideoConfig();
  const t = frame / fps;
  const master = seed || "song";
  const anim = WORD_ANIMS.includes(wordAnim) ? wordAnim : "off";
  const lAnim = LETTER_ANIMS.includes(letterAnim) ? letterAnim : "off";

  // Active cue = the last one that has STARTED. It does not need to test `end`:
  // as t passes cue.end, `until = cue.end - t` goes negative, cueStyle()'s
  // easeIn(clamp01(q)) falls to 0 and the line is invisible -- it fades out over
  // EXIT and is gone EXACTLY at its end. That is the contract the ends file
  // exists to enforce (gotcha 31); what broke it was the ends never reaching
  // this component, not this selection.
  let idx = -1;
  for (let i = 0; i < cues.length; i++) {
    if (cues[i].time <= t) idx = i;
    else break;
  }

  // The line just before, drifting away â€” reads as motion rather than a hard
  // cut. Its own presentation is resolved separately below, which is what turns
  // a change of placement into a cross-fade between two layouts instead of the
  // text jumping.
  //
  // Note that this is only reached when the previous line's own end has not
  // been passed: prevLife is progress through prev's [time, end) span, so once
  // prev.end <= t it clamps to 1 and prev is not drawn. With ends properly
  // wired (gotcha 31), prev.end is always <= the next line's start, so the
  // outgoing line is gone by the time the new one arrives.
  const prev = idx > 0 ? cues[idx - 1] : null;
  const prevAge = prev ? t - prev.time : 0;
  const prevSpan = prev ? prev.end - prev.time : 0;
  const prevLife = prevSpan > 0 ? clamp01(prevAge / prevSpan) : 1;

  const roam = mode === "roam";
  const horizontal = mode === "horizontal";
  const vertical = mode === "vertical";

// ---------------------------------------------------------------------------
// PLACEMENT
// ---------------------------------------------------------------------------
//
// --mode is how a line is PLACED on the frame. It is independent of
// --word-anim / --letter-anim, which control how a line is ANIMATED once placed.
//
//   center     (default) lines stack in the middle, the outgoing one drifts up
//   roam       each line gets its own seeded spot (the reference-video look)
//   horizontal one left-aligned band, lines stack downward
//   vertical   one centred narrow column, lines stack downward
//   mix        all of the above, planned across the song (see src/mix.js)
//
// Horizontal exists because roam fights word-by-word animation: in roam each
// line lands somewhere new, so a karaoke sweep makes the audience re-find the
// text every line. Pinned to one band it reads as one continuous left-to-right
// progression. Vertical is the same argument for short lyrics, where a 64vw
// band wastes the frame and a narrow column reads better.
//
// ONE RETURN PATH
// ---------------
// This used to be three, and the third one to be added was vertical -- at
// which point every future path was a chance to leave something out of one of
// them. That already happened once: `<Audio>` was only in the centre path, so
// every `--mode roam` render came out silent while still exiting 0. Silent and
// the right length is easy to ship, because nothing in the output says "no
// audio". So there is ONE return path now and placement is a per-cue property.
// If you add a placement, add it to geometry() -- there is nowhere else it can
// go wrong.
const MODE_DEFAULT_UNIT = "word";

/**
 * Where a block of text sits, for one placement.
 *
 * Numbers, not "64vw": the auto-fit below does arithmetic on the width to
 * count how many lines a cue wraps to, and "64vw" * 19.2 is NaN -- every
 * comparison against NaN is false, so the fit silently did nothing and the
 * clipped line stayed clipped. The unit is added at the point of use.
 *
 * The vertical values put banded text in the LOWER half. This is lyrics over a
 * camera feed, so the text has to clear a performer's head and shoulders,
 * which occupy the middle of frame. `center` = 56% is not the middle of the
 * frame and is not meant to be: the band TOP is at 56%, so one line sits around
 * 56-70% and a wrapped one 56-80%, both in the lower third where subtitle
 * convention puts them.
 */
function geometry(place, position, W, H) {
  const top = { top: 24, center: 56, bottom: 70 }[position || "center"];
  switch (place) {
    case "horizontal":
      return { kind: "band", left: 11, width: 64, top, align: "left", prevScale: 0.7 };
    case "vertical":
      // Narrow enough that a long line stacks into a readable column instead
      // of a single 84vw row, wide enough that the longest Allare cue (50
      // characters) does not become eight lines tall.
      return { kind: "band", left: 25, width: 50, top, align: "center", prevScale: 0.72 };
    case "center":
      // Centred on the frame rather than hung from a fixed top, which is what
      // the flexbox version did and what "center" means.
      return { kind: "centre", left: 8, width: 84, top: 50, align: "center", prevScale: 0.62 };
    case "roam":
    default:
      return { kind: "roam", align: "center", prevScale: 0.8 };
  }
}

/** The per-cue presentation, honouring --mode mix. */
const mixPlan =
  mode === "mix"
    ? buildMixPlan({ seed: master, cueCount: cues.length, block: Number(mixBlock) || 8, spec: mixPlanSpec || "" })
    : null;

// -- the motion plan (--motion) ------------------------------------------------
//
// One motion per cue, from a seeded deck, so no two neighbouring lines share a
// choreography and every motion in the pool is used. Empty when --motion is off
// or absent, and then cueMotion() returns {} and the line falls through to the
// original cueStyle path untouched -- the house style is unchanged by the mere
// existence of this feature.
const motionLevel = MOTION_LEVELS.includes(motion) ? motion : "off";
const motionPlan =
  motionLevel === "off"
    ? []
    : buildMotionPlan({ seed: master, cueCount: cues.length, level: motionLevel, block: Number(motionBlock) || 7 });
const motionAt = (cueIndex) => (motionPlan.length ? motionPlan[cueIndex] : null);

// A non-mix mode is a one-entry plan repeated, so there is exactly one code path
// that knows what a cue should look like -- not two that have to agree.
const presentationAt = (cueIndex) => {
  if (mixPlan && mixPlan[cueIndex]) return mixPlan[cueIndex];
  if (mixPlan && mixPlan.length) return mixPlan[0];
  const place = roam ? "roam" : horizontal ? "horizontal" : vertical ? "vertical" : "center";
  return { id: place, place, unit: MODE_DEFAULT_UNIT, block: 0 };
};

// Per-word colour for a PHRASE unit, which builds no word spans of its own.
//
// A phrase presentation animates as one block and deliberately has no per-word
// spans -- that is a real rule, and it is why word ANIMATION does not apply. But
// COLOUR does not need the animation spans, and the first attempt at phrase-line
// colour took the whole line's worth: `lineColor` gave every word the same hue,
// which produced an entirely red sentence. That is not an accent and it is not
// what was asked for; it is the palette applied to a phrase.
//
// So these spans carry a colour and NOTHING ELSE -- no transform, no opacity, no
// per-word size. The line still enters and exits as one gesture, and one word
// picked out of it is the entire effect.
//
// The split keeps the whitespace, because the line element is `white-space:
// pre-wrap` and rejoining with single spaces would silently re-flow a lyric that
// was exported with deliberate spacing.
function colorSpans(text, seed, index, mode, hue, scheme, accent) {
  const parts = String(text).split(/(\s+)/);
  return parts.map((part, i) => {
    if (!part || /^\s+$/.test(part)) return part;
    // The word ORDINAL counts only real words, so adding or removing whitespace
    // cannot shift which word gets the accent.
    const ordinal = parts.slice(0, i).filter((p) => p && !/^\s+$/.test(p)).length;
    const c = wordColor(mode, seed, hue, index, ordinal, { scheme, accent });
    return c ? (
      <span key={i} style={{ color: c.css }}>{part}</span>
    ) : part;
  });
}

const frameStyle = {
  // "transparent" = alpha overlay (mov / ProRes 4444). A colour like
  // "#000000" = keyable plate for containers without alpha (mp4): the
  // consumer sets the layer blend to Add/Screen so black disappears.
  backgroundColor: background || "transparent",
  padding: "0 8vw",
};

/**
 * --scanlines: one repeating gradient across the whole overlay.
 *
 * BRIGHT, never dark, and that is not a taste decision. Under Add blending
 * output = base + overlay, so a dark band adds nothing and would be invisible --
 * the effect would render, the log would say it was on, and the file would look
 * exactly the same as one without it. Under Screen blending a dark band DOES
 * show, so a dark scanline set is available there via --scanline-color.
 *
 * It is one element on the root rather than something applied to the words,
 * because it must not interact with the words' transforms -- a scanline that
 * rotated with the text would be a scanline no longer.
 */
function scanlineStyle(bands, alpha, color) {
  if (!(bands > 0)) return null;
  const gap = 100 / bands;
  return {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    zIndex: 50,
    backgroundImage:
      `repeating-linear-gradient(180deg, ${color} 0%, ${color} ` +
      `${(gap * 0.5).toFixed(3)}%, rgba(0,0,0,0) ${(gap * 0.5).toFixed(3)}%, ` +
      `rgba(0,0,0,0) 100%)`,
    opacity: alpha,
  };
}

// Built once per frame, above the lyrics so it sits over them, and null when the
// flag is absent so a normal render builds no extra node.
const scanEl = scanlineStyle(Number(scanlines) || 0, Number(scanlineAlpha) || 0.1, "#ffffff");
const scan = scanEl ? <AbsoluteFill style={scanEl} /> : null;

// The opening and closing cards sit under the lyrics, so z-order is a non-issue
// and there is only one place they have to be remembered.
const opener = titleCard || titleCardOutro ? (
  <TitleCard
    t={t}
    firstLyric={cues.length ? cues[0].time : NaN}
    lastLyricEnd={cues.length ? cues[cues.length - 1].end : NaN}
    title={title}
    band={band}
    color={color}
    anyway={!!titleCard && titleCard !== "no"}
    outro={!!titleCardOutro}
  />
) : null;

// The song, so the finished file syncs against its own audio with no external
// reference. This is inside the ONE return path, which is the only reason it
// cannot go missing from a mode again.
const song = AUDIO_FILE ? <Audio src={staticFile(AUDIO_FILE)} /> : null;

if (idx < 0) {
  return (
    <AbsoluteFill style={{ ...frameStyle, alignItems: "center", justifyContent: "center" }}>
      {song}
      {opener}
      {scan}
    </AbsoluteFill>
  );
}

const cue = cues[idx];
const since = t - cue.time;
const until = cue.end - t;

// -- AUTO-FIT ---------------------------------------------------------------
//
// A long line wraps, and a wrapped block grows DOWNWARD from a fixed top, so a
// three-line line runs off the bottom of the frame. Measured on Allare: the
// longest cue is 50 characters, and at 128px in a 64vw band it wraps to three
// lines, the last of which is clipped -- text half off the screen, with no
// error anywhere.
//
// The renderer cannot measure text while it renders, so the width is predicted
// from a per-font table of coefficients, which scripts/calibrate_width.mjs fits
// by rendering sample lines in the browser and measuring the ink they leave.
// The classification is in src/width-model.mjs, shared with the calibration so
// the two cannot drift.
//
// The three earlier attempts at this, and what each got wrong:
//
//   0.55em per code point     a Preeti font is ~0.48em per code point, so every
//                             legacy line was predicted to wrap when it does
//                             not and got shrunk ~28% for nothing
//   0.7153em, the mean of     counting matras as full-width. Shaping reorders
//     the whole Devanagari    a pre-base matra into space its consonant owns,
//     block                   so the real cost is 0.334em per code point. This
//                             one predicted THREE lines for a line the browser
//                             draws on ONE and shrank it to 75%
//   0.7480em, the mean of     narrow spaces averaged in with wide consonants
//     consonants only
//
// Falls back to the per-class defaults when no table is supplied, so a still
// rendered from an old props file still lays out rather than becoming NaN.
const widthTable =
  widthModel && typeof widthModel === "object" ? widthModel : null;

// SAFETY MARGIN. The model is fitted from measurements, so it is a little wrong
// in both directions, and the two directions are not equally bad. Under-
// predicting width means the chosen size needs one line more than the budget
// allows, and the last line runs off the bottom of the frame -- text half off
// the screen, which is the failure this whole thing exists to prevent.
// Over-predicting only costs a little size. So the width is inflated before the
// decision, and the error is spent on size rather than on clipping.
//
// 8% is measured, not guessed: the leave-one-out error on the lines that
// actually wrap is 1-6% on Allare (see scripts/calibrate_width.mjs), so 8% sits
// just outside it.
const WRAP_MARGIN = 1.08;

const fit = (text, size, bandWidth) => {
  const bandPx = bandWidth * (W_FRAME / 100);
  const w = widthEm(text, widthTable) * WRAP_MARGIN;
  const linesFor = (px) => Math.max(1, Math.ceil((w * px) / bandPx));
  // The budget covers the current line AND the outgoing one above it, since
  // both occupy the band at once.
  const budget = H_FRAME * 0.34;
  const needAt = (px) => linesFor(px) * px * 1.32;
  if (needAt(size) <= budget) return size;
  // Bisect rather than dividing once: the line count is a step function of the
  // size, so the obvious size * (budget / need) can land on a size that still
  // needs one line too many. It did, and the text stayed clipped.
  let lo = 8;
  let hi = size;
  for (let i = 0; i < 18 && hi - lo > 0.5; i++) {
    const mid = (lo + hi) / 2;
    if (needAt(mid) <= budget) lo = mid;
    else hi = mid;
  }
  return lo;
};

/**
 * Render one cue, positioned and sized for its presentation.
 *
 * `age` is how far through its own life the cue is, 0..1, used for the exit
 * fade. `isPrev` shrinks and fades the outgoing line, which is what makes a
 * change of placement read as the old layout dissolving rather than as a jump
 * cut: the outgoing line is drawn in ITS OWN presentation, resolved
 * independently, so a block boundary is a cross-fade between two layouts
 * instead of the text teleporting.
 */
function renderCue(cueObj, isPrev, life) {
  const pres = presentationAt(cueObj.index);
  const g = geometry(pres.place, position, W_FRAME, H_FRAME);

  const unitIsWord = pres.unit === "word";
  // Per-letter and per-word features need the word spans to exist, because the
  // letters nest inside them. Phrase presentations deliberately do not use them:
  // "the whole line arrives at once" is the point of the phrase unit, and
  // popping the letters one at a time would be the word unit wearing a
  // different hat.
  // Per-word colour needs per-word spans, so it joins the conditions that build
  // them. Without this, --color-mode wild would render every word the same
  // colour: the spans are what the per-word colour is attached to.
  const colorOn = COLOR_LEVELS.includes(colorMode) && colorMode !== "off";
  // The cut-paper look needs per-word spans too, for the same reason. And a
  // PHRASE unit deliberately has none -- so the cut and the colour both fall back
  // to being WHOLE-LINE properties on a phrase presentation. That is not a
  // workaround: a phrase line is one gesture, and one colour and one angle for
  // one gesture is correct rather than reduced.
  const cutOn = CUT_LEVELS.includes(cut) && cut !== "off";
  const typeOn = TYPE_LEVELS.includes(type) && type !== "off";
  const spans = unitIsWord && (
    anim !== "off" || lAnim !== "off" || Number(letterVar) > 0 ||
    colorOn || cutOn || typeOn
  );

  let size = fontSize;
  if (spans) {
    // animatedWords() renders the spans at the parent's size and carries the
    // variation internally, so the outer size is the base.
  } else if (sizeMode === "phrase") {
    size = fontSize * sizeFor(master, cueObj.index, Number(sizeVar) || 0);
  } else if (sizeMode === "word" && !spans) {
    size = fontSize;
  }
  if (isPrev) size *= g.prevScale;

  // Resolved FIRST because the word layer needs the same motion id, and the
  // word stagger must agree with the line's own choreography.
  const motionId = motionAt(cueObj.index);
  const motionPrm = motionId ? motionParams(master, cueObj.index, motionLevel) : null;

  // Banded and centred placements have a bounded width, so they wrap and need
  // the fit. Roam does not: its anchor is already chosen so a 60vw block fits,
  // and fitting it would shrink roam relative to every other mode.
  //
  // RESOLVED BEFORE `content` on purpose. animatedWords() needs the real pixel
  // size to scale the cut effect's lift and its torn edge, and it cannot work it
  // out from a fontSize percentage that the fit has not been applied to yet.
  const bandWidth = g.kind === "roam" ? 60 : g.width;
  const shown = g.kind === "roam" ? size : fit(cueObj.text, size, bandWidth);

  // Resolved BEFORE `content`, and not merely for tidiness: the first version
  // declared these below the content block and every render died with
  // "Cannot access 'accent' before initialization" -- a temporal dead zone error
  // thrown from inside the composition, which Remotion reports as a frame number
  // and no stack. Three of these values are needed by `content` itself.
  //
  // --cut / --color-mode on a PHRASE unit, which has no word spans.
  //
  // Colour is NOT taken from the line as a whole. The first version called
  // lineColor() for the line's colour, which gave every word the same hue -- an
  // entirely red sentence, which is a palette applied to a phrase rather than an
  // accent inside one, and the opposite of what was asked for.
  //
  // Cut still applies as ONE angle for the whole line, because a phrase line is
  // one piece of paper. Colour is the only thing that goes per word.
  const lineHue = Number.isFinite(Number(colorHue)) ? Number(colorHue) : 210;
  const accent = Number.isFinite(Number(colorAccent)) ? Number(colorAccent) : 1;
  const grad = colorOn && colorGradient
    ? gradientCss(colorMode, colorScheme, master, lineHue, cueObj.index)
    : null;

  const content = spans
    ? animatedWords(cueObj.text, {
        seed: master, index: cueObj.index, anim, sizeMode, sizeVar, t, sizeDrift,
        cueTime: cueObj.time, cueEnd: cueObj.end, letterAnim, letterSizeVar: letterVar,
        anchors: anchorsForCue(cueObj, beats, Number(beatTol) || 0.4),
        motionLevel, motionId, motionPrm,
        // The composition layers, plus this cue's own amplitude for the glow.
        depthLevel: depth, amplitude: cueAmplitude(cueObj.index),
        // Per-word and per-letter colour. The mode is validated in render.mjs
        // against the real list, and defaulted here as well because Remotion
        // resolves the composition BEFORE inputProps are applied -- an undeclared
        // prop arrives as undefined, and `undefined` must not be a colour level.
        colorMode: colorOn ? colorMode : "off",
        colorHue: Number.isFinite(Number(colorHue)) ? Number(colorHue) : 210,
        // `typeLag` is NOT passed in from here. It is a per-WORD quantity -- it depends
        // on that word's own start, which animatedWords() computes -- so passing
        // one value for the whole line would be meaningless. It flows DOWN from
        // there to letterNodes(). It was listed here by mistake, and the
        // resulting ReferenceError is thrown from inside the composition, which
        // Remotion reports as a bare frame number with no stack and no file.
        colorScheme, cut, type, stroke, strokeColor, baseSize: shown, accent,
        wordFill,
      })
    : sizeMode === "word"
      ? wordSpans(cueObj.text, master, cueObj.index, Number(sizeVar) || 0)
      : colorOn && !grad
        // A phrase unit still gets PER-WORD colour -- just not the animation
        // spans. See colorSpans(): colour and animation have different
        // requirements, and coupling them meant a whole sentence came out one
        // colour.
        ? colorSpans(cueObj.text, master, cueObj.index, colorMode, lineHue, colorScheme, accent)
        : cueObj.text;

  // --cut / --color-mode on a PHRASE unit, which has no word spans.
  //
  // Colour is NOT taken from the line as a whole. The first version called
  // lineColor() here, which gave every word of the line the same hue -- an
  // entirely red sentence, which is a palette applied to a phrase rather than an
  // accent inside one, and the opposite of what was asked for.
  //
  // Cut still applies as ONE angle for the whole line, because a phrase line is
  // one piece of paper. Colour is the only thing that goes per word.
  const lc = colorOn && grad ? lineColor(colorMode, colorScheme, master, lineHue, cueObj.index) : null;
  // A phrase line gets ONE cut angle, because it is one clipping.
  const phraseCut = cutOn ? wordCut(cut, master, cueObj.index, 0, fontSize) : null;
  const phraseCutT = phraseCut ? wordCutTransform(phraseCut) : "";

  const base = {
    fontFamily: FONT_FAMILY,
    fontWeight: 700,
    ...(LEGACY_FONT_FAMILY ? { fontWeight: 400 } : {}),
    // Colour: the per-word colour when there are spans, otherwise the line's own
    // colour -- which is only a fallback when a GRADIENT is on, since the gradient
    // supplies its own stops. A plain phrase line gets per-word colour from
    // colorSpans() above and never reaches here with a colour of its own.
    color: lc && grad ? lc.css : color,
    ...(grad
      ? {
        // background-clip: text paints a gradient through the glyphs without
        // touching their geometry, so it cannot step the shirorekha the way a
        // per-letter colour or size would.
        backgroundImage: grad,
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        // A transparent colour is what makes the clip show the gradient rather
        // than the fill, so it replaces the line colour ONLY while a gradient is
        // on -- both cannot be set, and the gradient is the one that was asked
        // for.
        WebkitTextFillColor: "transparent",
      }
      : {}),
    // --stroke. A hairline on the glyph outline. It changes no metric, so the
    // shirorekha is untouched, and it is the thing that keeps white text legible
    // over a bright pool of light on stage. See the blend warning on the flag:
    // a DARK stroke is invisible under pure Add and works under Screen.
    ...(Number(stroke) > 0
      ? { WebkitTextStroke: `${Number(stroke).toFixed(2)}px ${strokeColor || "#000000"}` }
      : {}),
    textShadow: shadow,
    fontSize: shown,
    lineHeight: 1.32,
    textAlign: g.align,
    whiteSpace: "pre-wrap",
    margin: 0,
    ...(g.kind === "roam" ? { maxWidth: "60vw" } : {}),
  };

  // The entrance/exit transform goes on an INNER element. Putting it on the
  // positioned box let glow's scale() overwrite the box's own translate(-50%,
  // -50%) and the block hung off the right edge of the frame; the same
  // overwrite took the band's top offset with it.
  //
  // TWO MOTION SYSTEMS LIVE HERE, kept separate on purpose because they answer
  // different questions:
  //
  //   cueStyle()  the line's ENTRANCE from the STYLES pool, plus the
  //               persistent-life styles (breathe, glow-pulse, pendulum). Its
  //               `life` argument is seconds since THIS cue started -- per cue,
  //               not the component's `since`, which belongs to the current line
  //               and is wrong for the outgoing one.
  //   cueMotion() the --motion layer (src/motion.js): span-proportional
  //               durations, travel clamped to the placement's real frame
  //               margin, per-word stagger, its own opacity envelope.
  //
  // --motion REPLACES cueStyle's transform rather than adding to it: both are
  // line-level entrances, and two of them on one element fight (gotcha 12 is
  // precisely two writes to `transform` on one box). The motion's opacity
  // envelope supersedes cueStyle's, and it is the one that has to be right --
  // it is what clears the line on its tapped end (gotcha 31).
  const cueAge = t - cueObj.time;
  const motionIdLocal = motionId;
  let inner = { ...cueStyle(pickedFor(cueObj.index), since / ENTER, until / EXIT, jitterFor(master, cueObj.index), cueAge), display: "inline-block" };

  if (motionIdLocal) {
    // HOW FAR THIS CUE MAY MOVE. Derived from the placement's real margin, not
    // from a taste constant, because a transform is exactly as capable of
    // pushing text off the frame as a bad anchor is (gotchas 13 and 17). Roam is
    // the placement that can genuinely run out of room, and when it does the
    // travel collapses to 0 and the motion falls back to scale/opacity/filter.
    const emW = widthEm(cueObj.text, widthTable) * WRAP_MARGIN;
    const bandPx = (g.kind === "roam" ? 60 : g.width) * (W_FRAME / 100);
    const blockW = Math.min(emW * shown, bandPx);
    const lines = Math.max(1, Math.ceil(blockW / bandPx));
    const blockH = lines * shown * 1.32;
    const travel = travelBudget({
      kind: g.kind,
      left: g.left,
      width: g.width,
      anchor: positionFor(master, cueObj.index),
      halfBlockW: blockW / 2,
      halfBlockH: blockH / 2,
      W: W_FRAME,
      H: H_FRAME,
    });

    const prm = motionPrm;
    const m = cueMotion({
      level: motionLevel,
      motionId,
      params: prm,
      // Per-cue, not the component's `since`/`until`: those belong to the
      // CURRENT line, and a line must be animated by its own clock.
      since: cueAge,
      until: cueObj.end - t,
      span: Math.max(0.01, cueObj.end - cueObj.time),
      travel,
      holdSeed: (cueObj.index % 7) / 7,
    });

    inner = {
      display: "inline-block",
      transform: m.transform || "",
      filter: m.filter || "",
      clipPath: m.clipPath || undefined,
      opacity: typeof m.opacity === "number" ? Math.max(0, Math.min(1, m.opacity)) : 1,
      // Motion's glow is ADDED to the line's own shadow, never substituted for
      // it: dropping the shadow would remove the dark halo that keeps white
      // text readable over a bright camera feed.
      textShadow: m.textShadow ? `${shadow ? shadow + ", " : ""}${m.textShadow}` : undefined,
    };
  }

  const box =
    g.kind === "roam"
      ? (() => {
          const p = positionFor(master, cueObj.index);
          return {
            position: "absolute",
            left: p.x + "%",
            top: p.y + "%",
            transform: "translate(-50%, -50%)",
          };
        })()
      : {
          position: "absolute",
          left: g.left + "vw",
          width: g.width + "vw",
          top: g.top + "%",
          // Only the centred placement translates; the bands hang from a fixed
          // top so a wrapped block grows downward predictably.
          ...(g.kind === "centre" ? { transform: "translateY(-50%)" } : {}),
        };

  // The outgoing line's own exit, which differs by placement: banded layouts
  // drift, roam dissolves in place (that is the reference video's measured
  // behaviour) and centre drifts up by a fixed amount.
  const exit = isPrev
    ? g.kind === "roam"
      ? {}
      : g.kind === "centre"
        ? { transform: `translateY(${-life * 30}px)` }
        : {}
    : {};

  return (
    <div style={{ ...base, ...box, ...exit, opacity: isPrev ? (1 - life) * 0.55 : undefined }}>
      <div style={inner}>{content}</div>
    </div>
  );
}

/** The entrance style for a cue, resolved the same way for it and its predecessor. */
function pickedFor(cueIndex) {
  return styleFor(master, cueIndex, style);
}

return (
  <AbsoluteFill style={frameStyle}>
    {song}

    {/* The outgoing line is drawn first, so the current line paints over it in
        the one frame where both are visible. Each is placed by its OWN
        presentation, which is what makes a block boundary a cross-fade between
        layouts instead of a jump. */}
    {prev && prevLife < 1 ? renderCue(prev, true, prevLife) : null}
    {renderCue(cue, false, 0)}

    {opener}
  </AbsoluteFill>
);
};
