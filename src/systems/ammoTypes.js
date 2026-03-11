// ─── Ammo Type Definitions ────────────────────────────────────────────────────
// Data-driven shockwave profiles for each ammo type.
// The single handgun fires different ammo types, each producing a unique shockwave.
//
// Shape types:
//   'cone'   — directional forward blast (coneHalfAngle controls spread)
//   'sphere' — omnidirectional blast from origin
//   'hybrid' — full-strength cone + weaker spherical splash

export const AMMO_TYPES = {
  standard: {
    label: 'Standard',
    shape: 'cone',
    radius: 5,                  // max reach (meters)
    coneHalfAngle: Math.PI / 4, // 45° half-angle
    force: 10,                  // base knockback force at origin
    damage: 2,                  // base damage at origin
    falloffExponent: 2,         // inverse-square falloff
    splashForceMult: 0,         // hybrid only: splash force multiplier (0 = no splash)
    // Visual config (Phase 3)
    visualColor: 0x88CCFF,
    visualScale: 1.0,
    cameraShake: 0.08,
    recoilMagnitude: 0.03,
  },
};
