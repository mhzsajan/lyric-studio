import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { LyricOverlay } from "./LyricOverlay.jsx";
import { normalizeProfile } from "./style-profile.js";
import { lastBeatBefore } from "./beats.js";
import { seededRandom, hashString } from "./animations.js";

// Styled mode: the full-frame "stunning" video, as opposed to the keyable
// white-on-black overlay.
//
// STRUCTURE -- AND WHY IT WRAPS RATHER THAN DUPLICATES
// ----------------------------------------------------
// LyricOverlay already owns every hard-won behaviour: ONE return path with the
// <Audio> in it (gotcha 15), geometry() as the only place placements exist,
// the width-model auto-fit, title cards, the word/letter animation layers.
// A second component that re-implements lyric drawing would drift from all of
// it. So Styled paints a background and delegates the text to the proven
// component with background="transparent" -- the explicit prop AFTER the
// spread, so no props.background from the CLI can punch a hole in the picture.
//
// DETERMINISM (the render contract)
// ---------------------------------
// Every visual here is a pure function of the frame time, the seed, and the
// beat list: no Date.now, no wall-clock, no CSS transitions, no unseeded
// random. Frame 400 captured now or in an hour is pixel-identical. The beat
// pulse reads the same beats.json the word quantizer does, so the picture and
// the words agree about where the beat is.

/** #rrggbb -> "r,g,b" for rgba() strings. Profile colours are validated hex. */
function rgb(hexColor) {
  const n = parseInt(hexColor.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(",");
}

/**
 * The seeded particle field. Positions are a pure function of (seed, index, t):
 * each mote drifts on its own vector and wraps at the frame edges.
 */
function ParticleField({ seed, count, palette, t, pulse }) {
  const particles = React.useMemo(() => {
    const out = [];
    for (let i = 0; i < count; i++) {
      const rnd = seededRandom(hashString("styled:particles:" + seed) + i * 7919);
      out.push({
        x: rnd() * 100,           // vw
        y: rnd() * 100,           // vh
        vx: (rnd() - 0.5) * 0.9,  // vw per second
        vy: -0.15 - rnd() * 0.5,  // vh per second, always rising
        size: 2 + rnd() * 5,      // px
        alpha: 0.12 + rnd() * 0.3,
        gold: rnd() < 0.5,
      });
    }
    return out;
  }, [seed, count]);

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {particles.map((p, i) => {
        const x = ((p.x + p.vx * t) % 100 + 100) % 100;
        const y = ((p.y + p.vy * t) % 100 + 100) % 100;
        const c = rgb(p.gold ? palette.accent1 : palette.glow);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x + "vw",
              top: y + "vh",
              width: p.size,
              height: p.size,
              borderRadius: "50%",
              background: `rgba(${c},${(p.alpha + pulse * 0.5).toFixed(3)})`,
              boxShadow: `0 0 ${(p.size * 3).toFixed(0)}px rgba(${c},${(p.alpha * 0.6).toFixed(3)})`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
}

/**
 * The aurora background: three radial light pools drifting on slow sine paths.
 * Phases and radii are seeded; positions are computed from t each frame.
 */
function Aurora({ seed, palette, t, pulse }) {
  const pools = React.useMemo(() => {
    const out = [];
    for (let i = 0; i < 3; i++) {
      const rnd = seededRandom(hashString("styled:aurora:" + seed) + i * 104729);
      out.push({
        cx: 20 + rnd() * 60,
        cy: 15 + rnd() * 70,
        ax: 12 + rnd() * 20,       // drift amplitude, vw
        ay: 8 + rnd() * 14,        // drift amplitude, vh
        wx: 0.02 + rnd() * 0.05,   // angular speed, rad/s -- a pool crosses
        wy: 0.015 + rnd() * 0.04,  // the frame in ~2 minutes, not ~2 seconds
        ph: rnd() * Math.PI * 2,
        r: 35 + rnd() * 30,        // radius, vw
        color: i === 0 ? palette.accent1 : i === 1 ? palette.accent2 : palette.glow,
        alpha: 0.10 + rnd() * 0.08,
      });
    }
    return out;
  }, [seed, palette]);

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {pools.map((p, i) => {
        const x = p.cx + Math.sin(t * p.wx * 2 * Math.PI + p.ph) * p.ax;
        const y = p.cy + Math.cos(t * p.wy * 2 * Math.PI + p.ph * 1.7) * p.ay;
        const a = p.alpha + pulse * 0.8;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              inset: 0,
              background: `radial-gradient(${p.r}vw ${p.r}vw at ${x.toFixed(2)}% ${y.toFixed(2)}%, rgba(${rgb(p.color)},${a.toFixed(3)}) 0%, rgba(${rgb(p.color)},0) 70%)`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
}

/** One soft linear wash whose angle creeps over minutes, not seconds. */
function GradientWash({ seed, palette, t, pulse }) {
  const rnd = React.useMemo(
    () => seededRandom(hashString("styled:gradient:" + seed)),
    [seed]
  );
  const phase = React.useMemo(() => rnd() * 360, [rnd]);
  const angle = (phase + t * 1.5) % 360; // 1.5 deg/s: a full turn in 4 minutes
  const a1 = 0.16 + pulse;
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        background:
          `linear-gradient(${angle.toFixed(2)}deg, ` +
          `rgba(${rgb(palette.accent1)},${a1.toFixed(3)}) 0%, ` +
          `rgba(${rgb(palette.bg)},0) 45%, ` +
          `rgba(${rgb(palette.accent2)},${(a1 * 0.8).toFixed(3)}) 100%)`,
      }}
    />
  );
}

export const Styled = (props) => {
  const { profile, beats, seed, ...rest } = props;
  const prof = normalizeProfile(profile);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const master = seed || "song";

  // Beat pulse: exp decay from the most recent beat. Pure function of
  // (t, beats) -- a scrubbed frame and a rendered frame agree exactly.
  const beat = lastBeatBefore(t, beats);
  const pulse = beat && prof.pulse > 0 ? prof.pulse * Math.exp(-beat.since * 5) : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: prof.palette.bg }}>
      {prof.kind === "aurora" ? (
        <Aurora seed={master} palette={prof.palette} t={t} pulse={pulse} />
      ) : null}
      {prof.kind === "gradient" ? (
        <GradientWash seed={master} palette={prof.palette} t={t} pulse={pulse} />
      ) : null}
      {prof.kind === "particles" ? (
        <ParticleField
          seed={master}
          count={prof.particles}
          palette={prof.palette}
          t={t}
          pulse={pulse}
        />
      ) : null}
      {/* kind === "solid" paints nothing over the bg colour, on purpose. */}

      {/* Vignette: darkened edges so text never competes with the frame border,
          and a bright background cannot eat the glow at the sides. */}
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          background:
            `radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 45%, ` +
            `rgba(0,0,0,${prof.vignette.toFixed(2)}) 100%)`,
        }}
      />

      {/* The lyrics: the proven overlay component, plate made transparent so
          this background shows through. titleCard/titleCardOutro arrive via
          props (styled defaults them ON in Root.jsx). */}
      <LyricOverlay {...rest} beats={beats} seed={seed} background="transparent" />
    </AbsoluteFill>
  );
};
