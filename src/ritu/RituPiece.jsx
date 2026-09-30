// src/ritu/RituPiece.jsx -- ṚITU, the full-frame piece.
//
// WHAT THIS IS, AND HOW IT DIFFERS FROM LyricOverlay
// ---------------------------------------------------
// LyricOverlay draws TEXT ON A PLATE, to be blended Add/Screen over a camera feed
// in Ableton. It is 1920x1080 of glyphs on black and nothing else, because
// everything else would fight the footage underneath it.
//
// This draws the whole picture. There is no feed under it, so there is nothing to
// protect: it paints a ground, a falling camera, Newar geometry, and type. That
// is the whole difference, and it is why the overlay's red-and-white rule does not
// carry over -- that rule exists because the plate is ADDED to a live image, not
// because bone-white on near-black is the only legible pairing.
//
// THE ONE RULE INHERITED UNCHANGED
// ---------------------------------
// Every cue still clears exactly at its tapped end. `scan_visibility.py` gates the
// finished file over every frame and this piece does not get an exception. The type
// arrives with the camera, is read while the camera passes it, and is GONE at the
// end of its cue -- not one frame later. That discipline is what the overlay batch
// was built to recover, and a new piece is not a reason to give it up.
//
// BEAT SYNC MOVES THE CAMERA AND NOT ONE GLYPH
// ---------------------------------------------
// The beat grid reaches `fallScale()` and nowhere else. There is no beat parameter
// on any function that returns a text time, which is the structural form of gotcha
// 31: the value the video needs is asserted inside the composition, not logged
// beside it.

import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import {
  RITU, Shikhara, Amalaka, Kalasha, Kirtimukha, ChaityaArch, Pagoda, Stupa,
  Jali, Pauwa, Chakra, Trishula, Padma, NagaHood, Lakhey, Torana, Drift,
} from "./motifs.jsx";
import { scaleAt, sectionAt, layerDepth, drift, RITU_SECTIONS } from "./camera.js";
import { seededRandom, hashString } from "../animations.js";
import { splitGraphemes } from "../letters.js";
// The font comes from the SAME prepared source as the overlay, deliberately. A
// second font path here would be a second thing to be wrong about the Devanagari,
// and the type here is Devanagari too -- a wrong family on a beautiful picture
// still produces a video with the wrong word on it.
import { FONT_FAMILY_NAME } from "../lyrics.generated.js";

/**
 * The layers of the fall, far to near.
 *
 * ORDER IS THE DEPTH. The parallax in `layerDepth()` depends on it, so a layer's
 * `z` is not decoration: moving one changes how fast it travels, and moving it to
 * the front makes a flat motif loom. The three bands are roughly:
 *
 *   far   the valley itself -- ground haze, the widest motifs, barely moving
 *   mid   the architecture -- shikharas, toranas, stupas
 *   near  the ornament -- lattice, kirtimukha, emblems, drifting close past
 *
 * Each band repeats several times, because one motif filling the frame is a
 * still life. The fall only works if there is always something else about to
 * arrive.
 */
const LAYERS = [
  { z: 0.00, kind: "pauwa", count: 3, scale: 1.5, opacity: 0.30 },
  { z: 0.10, kind: "stupa", count: 4, scale: 0.55, opacity: 0.42 },
  { z: 0.22, kind: "shikhara", count: 5, scale: 0.80, opacity: 0.50 },
  { z: 0.34, kind: "torana", count: 4, scale: 0.95, opacity: 0.55 },
  { z: 0.48, kind: "jali", count: 5, scale: 1.30, opacity: 0.40 },
  { z: 0.62, kind: "kirtimukha", count: 5, scale: 0.80, opacity: 0.62 },
  { z: 0.76, kind: "chakra", count: 4, scale: 0.45, opacity: 0.50 },
  { z: 0.88, kind: "padma", count: 3, scale: 0.40, opacity: 0.45 },
];

/**
 * Where one motif instance sits, in normalised frame coordinates.
 *
 * Seeded from the motif's own identity rather than from the frame, so an instance
 * never moves between frames -- a motif that jitters is a motif that reads as
 * noise. The spacing is a low-discrepancy walk rather than `random()`, because
 * plain random clumps: with 40 instances across a frame you get two dense patches
 * and a large empty middle, and the fall then has nothing to fall past.
 */
function place(slot, total, salt) {
  const golden = 0.61803398875;
  const a = (slot * golden) % 1;
  const b = (slot * 0.7548776662) % 1;      // a second, irrational stride
  const rnd = seededRandom(hashString("place:" + salt));
  const spread = 0.55 + rnd() * 0.5;
  return {
    x: (a - 0.5) * 118 * spread,
    y: (b - 0.5) * 92 * spread,
    rot: (slot % 3) * 12 - 12 + rnd() * 8,
    s: 0.72 + rnd() * 0.6,
  };
}

function Motif({ kind, seed, scale, opacity }) {
  switch (kind) {
    case "pauwa": return <Pauwa seed={seed} r={90} fill={RITU.inkCool} opacity={opacity} />;
    case "stupa": return <Stupa seed={seed} fill={RITU.inkCool} opacity={opacity} />;
    case "shikhara": return (
      <g opacity={opacity}>
        <Shikhara seed={seed} w={120} h={300} fill={RITU.inkCool} opacity={0.9} />
        <g transform="translate(0 -300)"><Amalaka seed={seed} r={30} opacity={0.8} /></g>
        <g transform="translate(0 -338)"><Kalasha seed={seed} opacity={0.9} /></g>
      </g>
    );
    case "torana": return <Torana seed={seed} w={220} opacity={opacity} />;
    case "jali": return <Jali seed={seed} w={170} h={230} depth={4} fill={RITU.inkWarm} opacity={opacity} />;
    case "kirtimukha": return <Kirtimukha seed={seed} s={1} fill={RITU.inkWarm} opacity={opacity} />;
    case "chakra": return <Chakra seed={seed} r={44} opacity={opacity} />;
    case "padma": return <Padma seed={seed} s={1} opacity={opacity} />;
    case "trishula": return <Trishula seed={seed} s={1} opacity={opacity} />;
    case "naga": return <NagaHood seed={seed} s={1} opacity={opacity} />;
    case "lakhey": return <Lakhey seed={seed} s={1} opacity={opacity} />;
    case "chaitya": return <ChaityaArch seed={seed} w={110} h={170} opacity={opacity} />;
    case "pagoda": return <Pagoda seed={seed} w={210} tiers={5} opacity={opacity} />;
    default: return null;
  }
}

/**
 * One lyric line, arriving with the camera.
 *
 * The line is read WHILE THE CAMERA IS PASSING IT: it comes up from below the
 * frame as the zoom reaches it, holds long enough to read, and dissolves into the
 * depth behind. It does not sit still in the middle, because a still line in front
 * of a moving camera is two competing motions and the eye believes neither.
 *
 * The opacity and the scale are driven from the CUE's own span, so they cannot
 * outlive it -- there is no separate exit animation to get wrong, and the line is
 * gone exactly at `cue.end` because that is where its input range ends.
 */
function CueLine({ cue, t, size, isRefrain, isPlea }) {
  const { index, time, end, text } = cue;
  const span = Math.max(0.001, end - time);
  const local = t - time;

  // Before its cue: nothing at all, not a faint ghost. A line that is faintly
  // visible before it is sung is a line that appears in the wrong place, and the
  // every-frame scan would count that ink as belonging to the previous cue.
  if (local < 0 || local > span) return null;

  // 0 -> 1 -> 0, mapped onto the cue's OWN span. `extrapolate: "clamp"` is what
  // makes the ends exactly zero rather than merely small.
  const q = local / span;
  const rise = interpolate(q, [0, 0.22], [0, 1], {
    extrapolate: "clamp", easing: Easing.out(Easing.cubic),
  });
  const fall = interpolate(q, [0.72, 1], [1, 0], {
    extrapolate: "clamp", easing: Easing.in(Easing.quad),
  });
  const opacity = rise * fall;
  if (opacity <= 0.001) return null;

  // The refrain is the thing the song repeats, so it is set larger and drifts
  // less; the plea is the only line allowed to be centred. Both are read from the
  // TEXT rather than hardcoded per cue, so a re-tap of the .lrc cannot orphan
  // them.
  const scale = (isRefrain ? 1.34 : isPlea ? 1.1 : 1) * (0.94 + rise * 0.06);
  const y = interpolate(rise, [0, 1], [46, 0]);
  const blur = interpolate(q, [0, 0.18, 0.8, 1], [14, 0, 0, 10], {
    extrapolate: "clamp",
  });

  const rnd = seededRandom(hashString("line:" + index));
  const jitter = (rnd() - 0.5) * 2.2;
  const align = isPlea ? "center" : index % 2 === 0 ? "flex-start" : "flex-end";

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: align,
        padding: "0 9vw",
        opacity,
        transform: `translateY(${y.toFixed(2)}px)`,
      }}
    >
      <div
        style={{
          fontSize: (size * scale).toFixed(2) + "px",
          lineHeight: 1.28,
          color: RITU.bone,
          textAlign: align,
          letterSpacing: "0.01em",
          fontWeight: 500,
          maxWidth: "78vw",
          // The type carries a wide, soft dark halo rather than a drop shadow: on
          // a moving ground a hard shadow reads as a second object.
          textShadow: "0 0 34px rgba(11,12,16,0.95), 0 0 10px rgba(11,12,16,0.9)",
          filter: blur > 0.4 ? `blur(${blur.toFixed(2)}px)` : undefined,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
}

export const RituPiece = ({
  cues = [],
  beats = [],
  fontSize = 108,
  seed = "ritu",
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps, width: W, height: H } = useVideoConfig();
  const t = frame / fps;
  const section = sectionAt(t);

  const beatTimes = Array.isArray(beats) ? beats : [];

  // The base fall. `scaleAt` is the section-rate integral and is monotonic by
  // construction; check_camera.mjs walks all 7530 frames to keep it that way.
  const s = scaleAt(t);
  const [cx, cy] = [W / 2, H / 2];

  // The ground: a radial fall-off from a warm centre, plus a slow vertical
  // gradient. Kept very dark -- this is a piece the user asked to be NOT bright,
  // and the type has to be the brightest thing in the frame by a wide margin.
  const ground = RITU.ground;

  // Dust. Slow, sparse, and never brighter than 0.32 opacity: enough to give the
  // empty 66-second cold open something to look at, not enough to read as snow.
  const motes = [];
  for (let i = 0; i < 46; i++) {
    const p = place(i, 46, "mote" + i);
    const d = layerDepth(t, 0.35 + (i % 5) * 0.12);
    const driftY = -((t * (7 + (i % 7) * 4)) % (H * 1.6));
    motes.push(
      <g key={"m" + i}
        transform={`translate(${(cx + p.x * d.scale * 0.5).toFixed(1)} ${(cy + p.y * d.scale * 0.5 + driftY).toFixed(1)}) scale(${d.scale.toFixed(3)})`}>
        <Drift seed={seed} i={i} opacity={0.5} />
      </g>
    );
  }

  return (
    <AbsoluteFill style={{ backgroundColor: ground, overflow: "hidden" }}>
      {/* the deep field: a warm centre falling off to near-black, which is what
          makes the zoom read as depth rather than as a brightening frame */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at 50% 48%, ${RITU.deep} 0%, ${ground} 62%)`,
        }}
      />

      {/* the falling motifs, far to near */}
      {LAYERS.map((layer, li) => {
        const depth = layerDepth(t, layer.z);
        return (
          <AbsoluteFill key={"L" + li} style={{ pointerEvents: "none" }}>
            {Array.from({ length: layer.count }).map((_, i) => {
              const p = place(i, layer.count, layer.kind + li);
              const sc = layer.scale * p.s * depth.scale;
              const rot = drift(t, layer.z, li + i);
              // Near layers pass the frame and are gone; far layers persist. The
              // opacity curve is what stops the near ornament from parking in the
              // middle of the shot.
              const fade = 1 - layer.z * 0.42;
              return (
                <g key={i}
                  transform={`translate(${(cx + p.x * depth.scale).toFixed(1)} ${(cy + p.y * depth.scale).toFixed(1)}) rotate(${(p.rot + rot).toFixed(2)}) scale(${sc.toFixed(4)})`}
                  opacity={(layer.opacity * depth.opacity * fade).toFixed(3)}
                >
                  <Motif kind={layer.kind} seed={`${seed}:${layer.kind}:${li}:${i}`}
                    scale={sc} opacity={1} />
                </g>
              );
            })}
          </AbsoluteFill>
        );
      })}

      {motes}

      {/* A vignette that closes in slightly as the song goes on. Subtle: it is
          there to keep the eye off the frame edge, not to be noticed. */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at 50% 50%, rgba(11,12,16,0) 42%, rgba(11,12,16,${(0.55 + Math.min(0.25, t * 0.0011)).toFixed(3)}) 100%)`,
        }}
      />

      {/* THE LYRIC. On top, and gated by its own cue span. The family is set once
          here rather than per line, so the measure `CueLine` works from and the
          glyphs the browser picks are the same decision. */}
      <div style={{ position: "absolute", inset: 0, fontFamily: FONT_FAMILY_NAME }}>
        {cues.map((c) => {
          const isRefrain = /बित्ला/.test(c.text);
          const isPlea = /बुझ/.test(c.text);
          return (
            <CueLine key={c.index} cue={c} t={t} size={fontSize}
              isRefrain={isRefrain} isPlea={isPlea} />
          );
        })}
      </div>

      {/* The cold open gets a title, because 66 seconds of nothing is a long time
          to wait and the song's own title IS its subject: ṚTU, season. */}
      {t < 9 && (
        <AbsoluteFill
          style={{
            justifyContent: "center", alignItems: "center",
            opacity: interpolate(t, [0.5, 2.5, 6.5, 9], [0, 0.9, 0.9, 0], {
              extrapolate: "clamp",
            }),
          }}
        >
          <div style={{
            fontSize: "150px", color: RITU.bone, fontWeight: 400,
            letterSpacing: "0.16em", textIndent: "0.16em",
            textShadow: "0 0 50px rgba(11,12,16,0.95)",
          }}>ऋतु</div>
          <div style={{
            marginTop: "18px", fontSize: "19px", color: RITU.ochre,
            letterSpacing: "0.42em", textIndent: "0.42em", opacity: 0.75,
          }}>कुनै ऋतु होइन</div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};