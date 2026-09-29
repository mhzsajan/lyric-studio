// The style profile: the "Look" contract for styled mode.
//
// WHY A PROFILE AND NOT FLAGS
// ---------------------------
// A look is a SET of choices that belong together -- palette, background kind,
// halo, pulse. Passing them as ten independent flags means every render
// command re-assembles the look by hand, and two commands that differ in one
// forgotten flag produce two different videos from "the same" style. A profile
// is one JSON file: styles/house.md is the prose, styles/*.json is the
// machine-readable contract, and --style-profile picks one.
//
// The defaults below ARE the house style (styles/default.json mirrors them).
// Every value is validated here rather than trusted: an invalid CSS colour in
// a profile does not error at render time, it silently paints nothing -- the
// same failure shape as the process.env "undefined" colour in render.mjs
// gotcha #1.

const HEX = /^#[0-9a-fA-F]{6}$/;

export const DEFAULT_PROFILE = {
  // aurora: slow-drifting radial light pools. gradient: one soft linear wash.
  // particles: seeded drifting motes. solid: flat colour, vignette only.
  kind: "aurora",
  palette: {
    // Deep ink, never pure black: styled mode is a full-frame picture, and a
    // #000 background with a coloured glow reads as an accident. (Pure black
    // stays the rule for OVERLAY mode, where the plate is keyed by blend mode.)
    bg: "#0a0a12",
    accent1: "#e8b34b", // warm gold
    accent2: "#c25b6a", // rose
    glow: "#f5e6c8",    // halo tint behind the text
  },
  // Beat pulse amplitude, 0..0.25. The background brightens by this much on a
  // beat and decays. 0 disables. Small on purpose: a pulse you notice is a
  // pulse that competes with the lyrics.
  pulse: 0.05,
  // Mote count for kind=particles. Seeded, so the field is identical on every
  // render of the same song.
  particles: 40,
  // Edge darkening, 0..1. Keeps a bright background from eating the text at
  // the frame edges.
  vignette: 0.55,
};

/** Validate a hex colour or fall back, naming the bad value. */
function hex(value, fallback, what) {
  if (typeof value === "string" && HEX.test(value)) return value;
  if (value !== undefined && value !== null) {
    console.warn(
      "  style profile: " + what + " " + JSON.stringify(value) +
      " is not a #rrggbb colour; using " + fallback
    );
  }
  return fallback;
}

function num(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/**
 * Merge a user profile onto the defaults, validating every field.
 * Accepts null/undefined (all defaults). Unknown keys are kept but unused,
 * so a profile written for a future version still loads.
 */
export function normalizeProfile(profile) {
  const p = profile && typeof profile === "object" ? profile : {};
  const pal = p.palette && typeof p.palette === "object" ? p.palette : {};
  const kinds = ["aurora", "gradient", "particles", "solid"];
  const kind = kinds.includes(p.kind) ? p.kind : DEFAULT_PROFILE.kind;
  if (p.kind !== undefined && !kinds.includes(p.kind)) {
    console.warn(
      "  style profile: unknown kind " + JSON.stringify(p.kind) +
      "; using " + kind + " (one of " + kinds.join(", ") + ")"
    );
  }
  return {
    ...p,
    kind,
    palette: {
      bg: hex(pal.bg, DEFAULT_PROFILE.palette.bg, "palette.bg"),
      accent1: hex(pal.accent1, DEFAULT_PROFILE.palette.accent1, "palette.accent1"),
      accent2: hex(pal.accent2, DEFAULT_PROFILE.palette.accent2, "palette.accent2"),
      glow: hex(pal.glow, DEFAULT_PROFILE.palette.glow, "palette.glow"),
    },
    pulse: num(p.pulse, DEFAULT_PROFILE.pulse, 0, 0.25),
    particles: Math.round(num(p.particles, DEFAULT_PROFILE.particles, 0, 400)),
    vignette: num(p.vignette, DEFAULT_PROFILE.vignette, 0, 1),
  };
}
