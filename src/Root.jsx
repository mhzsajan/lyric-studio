import React from "react";
import { Composition, staticFile } from "remotion";
import { getAudioDurationInSeconds } from "@remotion/media-utils";
import { parseLrc } from "./parse-lrc.mjs";
import { LyricOverlay } from "./LyricOverlay.jsx";
import { Styled } from "./Styled.jsx";
import { WidthCalib } from "./WidthCalib.jsx";
import { SAMPLE_W, SAMPLE_H } from "./width-model.mjs";
import { LRC_TEXT, AUDIO_FILE, AUDIO_SECONDS } from "./lyrics.generated.js";

const parsed = parseLrc(LRC_TEXT);
const WIDTH = Number(process.env.LYRIC_WIDTH || 1920);
const HEIGHT = Number(process.env.LYRIC_HEIGHT || 1080);

// If the audio cannot be probed, fall back to the last cue plus a tail. A
// slightly long clip is far safer than one that cuts the final line off.
const FALLBACK_SECONDS = Math.max(
  30,
  parsed.cues.length ? parsed.cues[parsed.cues.length - 1].end + 2 : 60
);

// ONE metadata resolver for every lyric composition. Duration maths used to
// live inline in the LyricOverlay composition alone; a second composition with
// its own copy is the composition-level shape of the roam-audio bug (gotcha
// 15) -- two paths that will eventually disagree about something that is not a
// style. LyricOverlay and LyricStyled therefore share this function and can
// only differ in look, never in length, fps or cues.
const resolveMetadata = async ({ props }) => {
  let seconds = FALLBACK_SECONDS;
  if (AUDIO_FILE) {
    try {
      // Probe a resolved URL, not the bare "/name.mp3": the browser-side
      // decoder cannot fetch a root-relative path.
      const probed = await getAudioDurationInSeconds(staticFile(AUDIO_FILE));
      if (typeof probed === "number" && probed > 0) seconds = probed;
    } catch (e) {
      // keep the fallback
    }
  }
  const tail = parsed.cues.length ? parsed.cues[parsed.cues.length - 1].end : 0;
  // FPS is a PROP, not an env var: env is baked into the cached webpack
  // bundle, so a changed LYRIC_FPS was silently ignored on re-render and the
  // returned metadata then overrode the CLI --fps flag. Props arrive at
  // runtime and cannot go stale.
  const fps = Number(props.fps) || 30;
  // A preview only needs to reach the last sung line. Rendered as a duration
  // cap HERE rather than as a `--frames` range on the command line: the two
  // disagreed, because this number is max(audio length, last cue) while
  // --frames was last cue + a fixed 2s tail (see gotcha 5). One place decides
  // the length, so the two can never disagree.
  // An explicit duration from render.mjs WINS, when it still covers the last
  // lyric. It exists for the --no-audio case, where there is no <Audio> in the
  // composition to probe, so `seconds` stays at its fallback and the length
  // would otherwise collapse to wherever the last lyric was estimated to end.
  //
  // GOTCHA 29 -- "wins" AND "floor" CANNOT BOTH BE TRUE, AND max() IS THE
  // FLOOR. The code was `max(seconds, tail, AUDIO_SECONDS)`, where `seconds` is
  // FALLBACK_SECONDS = max(30, tail + 2). So for `--no-audio --length 32` on a
  // song whose last lyric ends at 32.0 s, the fallback's own 2 s safety margin
  // beat the explicit 32 and the file came out 34 s -- caught by critique.py on
  // the first end-to-end run, not by a crash. The margin exists so a clip never
  // CUTS the last line; a caller who states the length has stated it, and a 2 s
  // margin protecting a number that is being replaced is not a safety margin.
  //
  // So the explicit value is used when it still covers `tail` (nothing is
  // truncated), and the max applies otherwise (a lyric running past the claimed
  // length is still shown, and critique.py's symmetric duration check reports
  // the disagreement instead of silently truncating it).
  const explicit = Number(AUDIO_SECONDS) || 0;
  const full =
    explicit >= tail && explicit > 0 ? explicit : Math.max(seconds, tail, explicit);
  const duration = props.preview ? Math.min(full, tail + 2) : full;
  return {
    durationInFrames: Math.round(duration * fps),
    fps,
    width: WIDTH,
    height: HEIGHT,
    // seed: honour the seed the CLI resolved (render.mjs sets props.seed =
    // --seed || lrc title || file name). This used to OVERWRITE props.seed
    // with parsed.title unconditionally, which made --seed a no-op on any
    // .lrc carrying a [ti:] -- a silently ignored flag, the worst kind. The
    // fallback chain stays for Studio, where no CLI props exist.
    props: { ...props, cues: parsed.cues, seed: props.seed || parsed.title || "song" },
  };
};

// Style comes in as PROPS, not process.env. Remotion statically replaces
// process.env.X at build time, and an unset variable becomes the literal
// string "undefined" -- which is truthy, so `process.env.LYRIC_COLOR ||
// "#ffffff"` yields "undefined", an invalid CSS colour that silently renders
// black. Number("undefined") is NaN, so the font size collapses to the
// browser default too. Props cannot be mangled this way.
const BASE_DEFAULTS = {
  cues: parsed.cues,
  seed: parsed.title || "song",
  style: undefined,
  fontSize: 104,
  // Random font size: "word" varies every word of a line, "phrase" scales the
  // whole line once, "off" disables. sizeVar is the max deviation from 1.0,
  // clamped to 0.45 in render.mjs.
  sizeMode: "word",
  sizeVar: 0.15,
  // Word-by-word animation: "off" animates whole lines, otherwise each word is
  // scheduled across the cue and animates as it arrives.
  wordAnim: "off",
  // Title and band, read from the .lrc's [ti:] and [ar:].
  title: parsed.title || "",
  band: parsed.band || "",
  titleCard: false,
  titleCardOutro: false,
  // Per-letter layer, nested inside each word span. letterVar is clamped to
  // 0.03 in render.mjs -- the measured shirorekha limit.
  letterAnim: "off",
  letterVar: 0,
  fps: 30,
  // Preview caps the timeline at the last sung line + 2s (resolveMetadata).
  preview: false,
  color: "#ffffff",
  // Beat sync: an ascending array of beat times in seconds (from
  // scripts/detect_beats.py via render.mjs --beats), or null. beatTol is how
  // far, in seconds, a word start may move to snap to a beat.
  beats: null,
  beatTol: 0.4,
};

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="WidthCalib"
        component={WidthCalib}
        durationInFrames={1}
        fps={1}
        width={SAMPLE_W}
        height={SAMPLE_H}
        // Both props are declared with defaults because Remotion resolves the
        // composition BEFORE inputProps are applied. A prop with no default and
        // no value renders as undefined, which draws an empty frame, and an
        // empty frame measures as zero width -- a silent nonsense number
        // rather than an error.
        defaultProps={{ font: "", index: 0 }}
      />
      <Composition
        id="LyricOverlay"
        component={LyricOverlay}
        durationInFrames={Math.round(FALLBACK_SECONDS * 30)}
        fps={30}
        width={WIDTH}
        height={HEIGHT}
        // ProRes 4444 = the alpha channel. Declared here so a bare
        // `remotion render` is correct with no extra flags.
        defaultCodec="prores"
        defaultProResProfile="4444"
        calculateMetadata={resolveMetadata}
        defaultProps={{
          ...BASE_DEFAULTS,
          // Soft dark halo keeps white text legible over a bright camera feed
          // without needing a background plate.
          shadow: "0 3px 18px rgba(0,0,0,0.55), 0 0 60px rgba(0,0,0,0.35)",
          position: "center",
          // "transparent" renders an alpha overlay (mov); render.mjs passes
          // "#000000" for mp4 so the plate is keyable with Add/Screen blend.
          background: "transparent",
        }}
      />
      <Composition
        id="LyricStyled"
        component={Styled}
        durationInFrames={Math.round(FALLBACK_SECONDS * 30)}
        fps={30}
        width={WIDTH}
        height={HEIGHT}
        // Styled mode is a full-frame picture: h264 mp4 is the deliverable and
        // alpha is meaningless, so no ProRes default here (that is the overlay
        // composition's contract with Videosync2).
        defaultCodec="h264"
        calculateMetadata={resolveMetadata}
        defaultProps={{
          ...BASE_DEFAULTS,
          // The house style (styles/house.md): title cards on, mix placement,
          // karaoke words, white halo on every line -- the feature REFERENCE.md
          // measured as missing versus the target video.
          titleCard: true,
          titleCardOutro: true,
          mode: "mix",
          mixBlock: 8,
          wordAnim: "karaoke",
          letterAnim: "pop",
          letterVar: 0.03,
          fontSize: 128,
          shadow:
            "0 0 18px rgba(255,255,255,0.9), 0 0 60px rgba(255,255,255,0.4), 0 2px 10px rgba(0,0,0,0.65)",
          position: "center",
          // The Styled component paints the plate (style profile) and forces
          // this to "transparent" on the inner overlay regardless.
          background: "transparent",
          // null = the DEFAULT_PROFILE in src/style-profile.js. render.mjs
          // passes the parsed JSON of --style-profile here.
          profile: null,
        }}
      />
    </>
  );
};
