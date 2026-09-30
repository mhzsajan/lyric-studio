// src/ritu/motifs.jsx -- the Newar material, drawn.
//
// WHY PROCEDURAL SVG AND NOT AN ASSET
// ----------------------------------
// The camera falls forward forever, so every mark is scaled past the point where
// a raster would survive. A PNG at 2048px is unusable at 40x zoom; a path is not.
// Second reason: the palette is per-element and damped, which is impossible to
// adjust once it is baked into an image. Third: a motif is a FUNCTION of a seed,
// so the same temple is never quite in the same place twice, and none of that is
// stored.
//
// WHAT IS DRAWN, AND WHAT IS NOT
// -----------------------------
// A recognisable Newar deity cannot be drawn procedurally. Taleju's face needs an
// artist's hand and reference photographs, and a wrong-faced deity is worse than
// no deity -- so this file does not attempt portraiture. It draws the MATERIAL
// that surrounds the figures, which is made of the same geometry: the torana, the
// shikhara, the amalaka, the kalasha, the kirtimukha.
//
// The kirtimukha is the exception that proves the rule. It IS a face -- the
// "face of glory" on every Newar beam-end -- so it is drawn, and it is the motif
// that carries the register.
//
// Each function returns SVG children, NOT a complete <svg>. The caller owns the
// viewBox and the transform, because every motif here is placed inside the same
// falling camera and a motif that chose its own coordinate system would not line
// up with anything else.

import React from "react";
import { seededRandom, hashString } from "../animations.js";

// --- the valley palette ------------------------------------------------------
// Damp on purpose. Nothing here reaches full chroma; the piece has to sit under
// bone-white type without competing with it, and a bright ochre behind light type
// is a legibility problem before it is a taste problem.
export const RITU = {
  ground: "#0B0C10",
  deep: "#151A22",
  inkCool: "#2A3038",
  inkWarm: "#4A4038",
  oxblood: "#6E1F26",
  ochre: "#8A6A3A",
  bone: "#E8E2D6",
};

/** Deterministic per-motif jitter, so nothing is random frame to frame. */
const rndFor = (salt, seed) => seededRandom(hashString(salt + ":" + String(seed)));

/**
 * The śikhara -- the tower over the sanctum.
 *
 * Ratios are the Newar ones rather than a generic spire: a tall tapering
 * curvilinear profile in three diminishing stages, each separated by a band, on a
 * moulded plinth. Drawn as a stack of offset trapezoids with a concave taper,
 * because that is what a shikhara IS -- repeated diminishing storeys, not one
 * smooth curve.
 */
export function Shikhara({ seed = 0, w = 120, h = 300, fill = RITU.inkCool, opacity = 1 }) {
  const tiers = 5;
  const parts = [];
  let y = h;
  let cw = w;
  for (let i = 0; i < tiers; i++) {
    const th = h / (tiers + 1.6);
    const nw = cw * 0.74;
    parts.push(
      <rect key={"t" + i} x={-nw / 2} y={y - th} width={nw} height={th}
        fill={fill} opacity={opacity * (0.55 + i * 0.09)} />
    );
    // The band between storeys. This is the horizontal that makes the tower read
    // as Newar rather than as a generic pagoda: Newar shikharas are visibly
    // stepped, and the step is the ornament.
    parts.push(
      <rect key={"b" + i} x={-nw / 2 - 3} y={y - th - 2} width={nw + 6} height={2.5}
        fill={RITU.ochre} opacity={opacity * 0.42} />
    );
    y -= th + 2.5;
    cw = nw;
  }
  return <g>{parts}</g>;
}

/** The amalaka: the ribbed disc that crowns a shikhara, under the kalasha. */
export function Amalaka({ seed = 0, r = 30, fill = RITU.inkCool, opacity = 1 }) {
  const ribs = 16;
  const out = [<circle key="d" r={r} fill={fill} opacity={opacity * 0.8} />];
  for (let i = 0; i < ribs; i++) {
    const a = (i / ribs) * Math.PI * 2;
    out.push(
      <line key={i} x1={Math.cos(a) * r * 0.55} y1={Math.sin(a) * r * 0.55}
        x2={Math.cos(a) * r} y2={Math.sin(a) * r}
        stroke={RITU.ochre} strokeWidth={1.4} opacity={opacity * 0.3} />
    );
  }
  return <g>{out}</g>;
}

/** The kalasha: the finial pot. The last thing a donor gilds. */
export function Kalasha({ seed = 0, s = 1, fill = RITU.oxblood, opacity = 1 }) {
  return (
    <g opacity={opacity}>
      <path d="M-7 -14 L7 -14 L5 -4 Q0 8 -5 -4 Z" fill={fill} opacity={0.9} />
      <circle cx={0} cy={-18} r={4.5} fill={RITU.ochre} opacity={0.85} />
      <rect x={-9} y={-16} width={18} height={2.4} fill={RITU.ochre} opacity={0.7} />
      <path d="M0 -22 L0 -28" stroke={RITU.ochre} strokeWidth={1.6} opacity={0.8} />
    </g>
  );
}

/**
 * The kīrtimukha -- the face of glory.
 *
 * The signature Newar motif: a stylised lion-kirti face, wide jaw, curling
 * tongue, flanked by scrolls, set on every beam-end and over every door in the
 * valley. Drawn symmetrically about x=0 because it is a carved bracket and it was
 * carved to be seen from below and centred.
 *
 * This is the one face in the file and it is deliberately NOT a deity's face. A
 * kirtimukha is a guardian mask, and drawing it as a monster is correct.
 */
export function Kirtimukha({ seed = 0, s = 1, fill = RITU.inkWarm, opacity = 1 }) {
  const W = 46, H = 40;
  return (
    <g transform={`scale(${s})`} opacity={opacity}>
      {/* the jaw and cheeks: one broad arc, so the face reads as a mask not a head */}
      <path d={`M${-W} ${-6} Q${-W} ${H} 0 ${H} Q${W} ${H} ${W} ${-6}
                Q${W * 0.55} ${2} 0 ${-4} Q${-W * 0.55} ${2} ${-W} ${-6} Z`}
        fill={fill} opacity={0.9} />
      {/* the scrolling flanks -- the foliate brackets either side of the jaw */}
      <path d={`M${-W} ${-4} q${-W * 0.4} ${-2} ${-W * 0.5} ${-14}`}
        stroke={fill} strokeWidth={5} fill="none" opacity={0.75} />
      <path d={`M${W} ${-4} q${W * 0.4} ${-2} ${W * 0.5} ${-14}`}
        stroke={fill} strokeWidth={5} fill="none" opacity={0.75} />
      {/* the eyes: heavy lidded almonds, the Newar convention rather than round ones */}
      <path d={`M${-W * 0.5} ${2} q${W * 0.16} ${-9} ${W * 0.32} 0`}
        stroke={RITU.ground} strokeWidth={3.4} fill="none" opacity={0.85} />
      <path d={`M${W * 0.5} ${2} q${-W * 0.16} ${-9} ${-W * 0.32} 0`}
        stroke={RITU.ground} strokeWidth={3.4} fill="none" opacity={0.85} />
      {/* the curling tongue, which is what makes it a kirtimukha and not a lion */}
      <path d={`M0 ${6} q${7} ${10} 0 ${18} q${-7} ${-8} 0 ${-18} Z`}
        fill={RITU.oxblood} opacity={0.9} />
      {/* the crown of small bosses above the brow */}
      {[0, 1, 2, 3].map((i) => (
        <circle key={i} cx={-18 + i * 12} cy={-9} r={3} fill={RITU.ochre} opacity={0.5} />
      ))}
    </g>
  );
}

/**
 * The chaitya arch -- the Buddhist temple arch, horseshoe with an inward-pointing
 * apex. Drawn as a closed path rather than an arc because the apex TUCKS IN, and
 * an arc cannot tuck.
 */
export function ChaityaArch({ seed = 0, w = 100, h = 160, fill = RITU.inkCool, opacity = 1 }) {
  const r = w / 2;
  return (
    <g opacity={opacity}>
      <path d={`M${-r} ${h} L${-r} ${-r * 0.2}
                Q${-r} ${-h * 0.72} 0 ${-h * 0.86}
                Q${r} ${-h * 0.72} ${r} ${-r * 0.2}
                L${r} ${h} L${r - 10} ${h} L${r - 10} ${-r * 0.2}
                Q${r - 10} ${-h * 0.5} 0 ${-h * 0.62}
                Q${-r + 10} ${-h * 0.5} ${-r + 10} ${-r * 0.2}
                L${-r + 10} ${h} Z`} fill={fill} opacity={0.85} />
    </g>
  );
}

/** The tiered pagoda roof -- pāñcatō. Each tier shrinks and overhangs. */
export function Pagoda({ seed = 0, w = 200, tiers = 5, fill = RITU.inkCool, opacity = 1 }) {
  const out = [];
  const th = 26;
  for (let i = 0; i < tiers; i++) {
    const t = w * (1 - i * 0.13);
    out.push(
      <path key={i} d={`M${-t / 2} ${-i * th} L${t / 2} ${-i * th}
                         L${t / 2 - 14} ${-(i + 1) * th + 4} L${-t / 2 + 14} ${-(i + 1) * th + 4} Z`}
        fill={fill} opacity={opacity * (0.5 + i * 0.1)} />
    );
    // the eave line -- the deep projecting roof that shades the storey
    out.push(
      <rect key={"e" + i} x={-t / 2 - 5} y={-(i + 1) * th + 2} width={t + 10} height={2.6}
        fill={RITU.inkWarm} opacity={opacity * 0.5} />
    );
  }
  return <g>{out}</g>;
}

/** The stupa -- chaitya as a whole: dome, harmika, canopy, spire. */
export function Stupa({ seed = 0, s = 1, fill = RITU.inkCool, opacity = 1 }) {
  return (
    <g transform={`scale(${s})`} opacity={opacity}>
      {/* the three terraces */}
      {[0, 1, 2].map((i) => (
        <rect key={i} x={-70 + i * 8} y={70 - i * 14} width={140 - i * 16} height={14}
          fill={fill} opacity={0.55 + i * 0.12} />
      ))}
      {/* the dome -- a stepped stack, because a stupa dome is built in courses */}
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={"d" + i} x={-46 + i * 5} y={56 - i * 11} width={92 - i * 10} height={11}
          fill={fill} opacity={0.62 + i * 0.08} />
      ))}
      {/* the harmika, and the eyes that look out from it */}
      <rect x={-20} y={-14} width={40} height={16} fill={fill} opacity={0.8} />
      <circle cx={-9} cy={-6} r={3} fill={RITU.ochre} opacity={0.55} />
      <circle cx={9} cy={-6} r={3} fill={RITU.ochre} opacity={0.55} />
      {/* the canopy and spire */}
      <path d="M-16 -18 L16 -18 L0 -34 Z" fill={fill} opacity={0.85} />
      <rect x={-2} y={-58} width={4} height={26} fill={RITU.ochre} opacity={0.6} />
    </g>
  );
}

/**
 * The jāli -- the lattice screen, built by recursive arc subdivision.
 *
 * `pānā` in timber, `nari-kuna` in brick: same geometry, different material. The
 * recursion is mitred so the arcs meet cleanly at every level, which is what makes
 * it read as carved rather than as a wireframe.
 */
export function Jali({ seed = 0, w = 160, h = 220, depth = 4, fill = RITU.inkCool, opacity = 1 }) {
  const rnd = rndFor("jali", seed);
  const out = [];
  const cell = Math.min(w, h) / Math.pow(2, depth / 2);
  for (let y = 0; y < h; y += cell) {
    for (let x = 0; x < w; x += cell) {
      const k = rnd();
      const cx = x + cell / 2 - w / 2;
      const cy = y + cell / 2 - h / 2;
      const r = cell * 0.46;
      if (k > 0.62) {
        // the cusped arch, in the four orientations
        const rot = Math.floor(k * 4) * 90;
        out.push(
          <path key={`${x}_${y}`}
            d={`M${-r} ${r * 0.6} Q${-r} ${-r * 0.5} 0 ${-r * 0.6}
               Q${r} ${-r * 0.5} ${r} ${r * 0.6} Z`}
            transform={`translate(${cx} ${cy}) rotate(${rot})`}
            stroke={fill} strokeWidth={1.6} fill="none" opacity={opacity * 0.5} />
        );
      } else {
        // the diamond void
        out.push(
          <path key={`${x}_${y}`}
            d={`M0 ${-r} L${r} 0 L0 ${r} L${-r} 0 Z`}
            transform={`translate(${cx} ${cy})`}
            fill={fill} opacity={opacity * 0.28} />
        );
      }
    }
  }
  return <g>{out}</g>;
}

/** The pāuwa -- the paubha rosette. Rotated squares nested over a disc. */
export function Pauwa({ seed = 0, r = 90, fill = RITU.inkCool, opacity = 1 }) {
  const rnd = rndFor("pauwa", seed);
  const out = [];
  const rings = 5;
  for (let i = 0; i < rings; i++) {
    const rr = r * (1 - i * 0.17);
    const rot = 45 * i + Math.floor(rnd() * 3) * 15;
    out.push(
      <rect key={i} x={-rr} y={-rr} width={rr * 2} height={rr * 2}
        transform={`rotate(${rot})`}
        stroke={i % 2 ? RITU.ochre : fill}
        strokeWidth={i % 2 ? 1.1 : 1.8}
        fill="none" opacity={opacity * (0.5 - i * 0.06)} />
    );
    const petals = 8 + i * 4;
    for (let p = 0; p < petals; p++) {
      const a = (p / petals) * Math.PI * 2 + i * 0.2;
      out.push(
        <circle key={i + "_" + p} cx={Math.cos(a) * rr * 0.92} cy={Math.sin(a) * rr * 0.92}
          r={rr * 0.045} fill={i % 2 ? fill : RITU.oxblood} opacity={opacity * 0.4} />
      );
    }
  }
  out.push(<circle key="c" r={r * 0.1} fill={RITU.oxblood} opacity={opacity * 0.6} />);
  return <g>{out}</g>;
}

/**
 * The emblems -- cakra, vajra, triśūla, padma, nāga hood, śvasti.
 *
 * These are what a deity HOLDS rather than what a deity looks like, and they are
 * the honest way to put the gods in a piece that cannot draw a face. Each is the
 * simplest correct form: the wheel is a wheel, the trident is a trident.
 */
export function Chakra({ seed = 0, r = 40, opacity = 1 }) {
  const out = [];
  const spokes = 16;
  out.push(<circle key="o" r={r} fill="none" stroke={RITU.ochre} strokeWidth={2.4} opacity={opacity * 0.55} />);
  out.push(<circle key="i" r={r * 0.78} fill="none" stroke={RITU.ochre} strokeWidth={1.4} opacity={opacity * 0.4} />);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    out.push(
      <line key={i} x1={Math.cos(a) * r * 0.78} y1={Math.sin(a) * r * 0.78}
        x2={Math.cos(a) * r} y2={Math.sin(a) * r}
        stroke={RITU.ochre} strokeWidth={2} opacity={opacity * 0.45} />
    );
  }
  out.push(<circle key="h" r={r * 0.14} fill={RITU.oxblood} opacity={opacity * 0.7} />);
  return <g>{out}</g>;
}

export function Trishula({ seed = 0, s = 1, opacity = 1 }) {
  return (
    <g transform={`scale(${s})`} opacity={opacity} stroke={RITU.ochre} fill="none">
      <path d="M0 46 L0 -18" strokeWidth={2.6} opacity={0.6} />
      <path d="M0 -18 L0 -34 M0 -18 Q-13 -26 -15 -38 M0 -18 Q13 -26 15 -38"
        strokeWidth={2.6} opacity={0.6} />
      <path d="M0 -34 a3 3 0 1 0 0.1 0 M-15 -38 a3 3 0 1 0 0.1 0 M15 -38 a3 3 0 1 0 0.1 0"
        strokeWidth={0} fill={RITU.oxblood} stroke="none" opacity={0.8} />
      <circle cx={0} cy={4} r={5} fill="none" strokeWidth={2} opacity={0.5} />
    </g>
  );
}

export function Padma({ seed = 0, s = 1, opacity = 1 }) {
  const petals = 12;
  const out = [];
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * 360;
    out.push(
      <ellipse key={i} cx={0} cy={-14} rx={5.5} ry={13}
        transform={`rotate(${a})`}
        fill={i % 2 ? RITU.inkWarm : RITU.oxblood}
        opacity={opacity * (i % 2 ? 0.42 : 0.5)} />
    );
  }
  out.push(<circle key="c" r={6} fill={RITU.ochre} opacity={opacity * 0.5} />);
  return <g transform={`scale(${s})`}>{out}</g>;
}

/** The nāga hood -- the serpent canopy. Five cobra hoods, Newar temple form. */
export function NagaHood({ seed = 0, s = 1, opacity = 1 }) {
  const out = [];
  for (let i = -2; i <= 2; i++) {
    const h = 34 - Math.abs(i) * 7;
    out.push(
      <path key={i} d={`M${i * 13 - 9} 0 q${-2} ${-h * 0.6} ${9} ${-h} q${11} ${h * 0.4} 9 ${h} Z`}
        fill={RITU.inkCool} opacity={opacity * 0.6} />
    );
  }
  return <g transform={`scale(${s})`}>{out}</g>;
}

/** The Lakhey dancer -- a stylised masked figure. Masks are stylised already. */
export function Lakhey({ seed = 0, s = 1, opacity = 1 }) {
  const rnd = rndFor("lakhey", seed);
  const arm = 30 + rnd() * 26;
  return (
    <g transform={`scale(${s})`} opacity={opacity}>
      {/* the body, in the dancer's crouch */}
      <path d="M0 8 L0 44" stroke={RITU.inkWarm} strokeWidth={7} opacity={0.55} />
      <path d={`M0 16 L${-arm} ${-6}`} stroke={RITU.inkWarm} strokeWidth={4.5} opacity={0.5} />
      <path d={`M0 16 L${arm} ${2}`} stroke={RITU.inkWarm} strokeWidth={4.5} opacity={0.5} />
      <path d="M-10 44 L10 44" stroke={RITU.inkWarm} strokeWidth={5} opacity={0.5} />
      {/* the mask: broad, with the bulging eyes and the wide mouth */}
      <circle cx={0} cy={-6} r={15} fill={RITU.inkWarm} opacity={0.72} />
      <circle cx={-6} cy={-9} r={4.4} fill={RITU.ground} opacity={0.9} />
      <circle cx={6} cy={-9} r={4.4} fill={RITU.ground} opacity={0.9} />
      <path d="M-9 2 Q0 12 9 2" stroke={RITU.ground} strokeWidth={3} fill="none" opacity={0.9} />
      <circle cx={-6} cy={-9} r={1.5} fill={RITU.oxblood} opacity={0.9} />
      <circle cx={6} cy={-9} r={1.5} fill={RITU.oxblood} opacity={0.9} />
    </g>
  );
}

/**
 * The torana -- the gate. A two-storey stepped entrance with the kirtimukha over
 * it, which is the composition that actually appears on every Newar temple gate.
 */
export function Torana({ seed = 0, w = 220, opacity = 1 }) {
  return (
    <g opacity={opacity}>
      <Pagoda seed={seed} w={w} tiers={3} fill={RITU.inkCool} opacity={0.6} />
      <g transform="translate(0 -46)">
        <Kirtimukha seed={seed} s={0.55} fill={RITU.inkWarm} opacity={0.7} />
      </g>
      <rect x={-w * 0.34} y={-20} width={w * 0.68} height={20}
        fill={RITU.ground} opacity={0.85} />
    </g>
  );
}

/** A drifting particle: ash, dust, a fallen leaf. Slow, and never bright. */
export function Drift({ seed = 0, i = 0, opacity = 1 }) {
  const rnd = rndFor("drift" + i, seed);
  const r = 1.4 + rnd() * 3.2;
  return (
    <circle r={r} fill={rnd() > 0.72 ? RITU.ochre : RITU.bone}
      opacity={opacity * (0.1 + rnd() * 0.22)} />
  );
}