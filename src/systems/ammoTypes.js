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
    audioProfileKey: 'standard',
    audioGain: 0.18,
    audioPitchJitter: 0.03,
    shape: 'cone',
    radius: 5.75,                     // max reach (meters)
    coneHalfAngle: (52 * Math.PI) / 180, // 52° half-angle
    force: 10,                  // base knockback force at origin
    damage: 2,                  // base damage at origin
    falloffExponent: 2,         // inverse-square falloff
    splashForceMult: 0,         // hybrid only: splash force multiplier (0 = no splash)
    // Visual config (Phase 3)
    visualColor: 0x88CCFF,
    visualScale: 1.0,
    cameraShake: 0.08,
    recoilMagnitude: 0.03,
    spiderShock: {
      // Standard has force:10 / radius:5.75 vs heavy's force:20 / radius:17.25.
      // knockbackMult compensates so close-range hits feel comparable to heavy.
      knockbackMult: 6.0,
      launchScalar: 0.88,
      upwardScalarFloor: 0.38,
      upwardScalarWall: 0.26,
      magnitudeCap: 14.0,
      maxLaunchSpeed: 9.5,
      detachThreshold: 1.0,
      landLockTime: 0.07,
      landLockMinTravel: 0.09,
      recoverFloorTime: 0.65,
    },
  },
  heavyHandgun: {
    label: 'Heavy Handgun',
    audioProfileKey: 'heavyHandgun',
    audioGain: 0.23,
    audioPitchJitter: 0.02,
    shape: 'cone',
    // 3x depth and widened cone so heavy rounds cover camera-edge targets.
    radius: 17.25,
    coneHalfAngle: (60 * Math.PI) / 180,
    force: 20,
    damage: 2,
    falloffExponent: 2,
    splashForceMult: 0,
    visualColor: 0x88CCFF,
    visualScale: 1.0,
    cameraShake: 0.08,
    recoilMagnitude: 0.03,
    spiderShock: {
      knockbackMult: 1.0,
      launchScalar: 0.96,
      upwardScalarFloor: 0.78,
      upwardScalarWall: 0.72,
      magnitudeCap: 42.0,
      maxLaunchSpeed: 28.5,
      detachThreshold: 1.0,
      landLockTime: 0.1,
      landLockMinTravel: 0.14,
      recoverFloorTime: 0.95,
    },
  },
};

export const AMMO_ITEM_PROFILE_MAP = Object.freeze({
  ammo: 'standard',
  ammoHeavy: 'heavyHandgun',
});

const DEFAULT_AMMO_PROFILE_KEY = 'standard';

export function getAmmoProfileKeyForItem(ammoItemType) {
  if (typeof ammoItemType !== 'string') {
    return DEFAULT_AMMO_PROFILE_KEY;
  }

  const mappedProfile = AMMO_ITEM_PROFILE_MAP[ammoItemType];
  if (mappedProfile && AMMO_TYPES[mappedProfile]) {
    return mappedProfile;
  }

  return DEFAULT_AMMO_PROFILE_KEY;
}

export function getAmmoConfigForItem(ammoItemType) {
  const profileKey = getAmmoProfileKeyForItem(ammoItemType);
  return AMMO_TYPES[profileKey] || AMMO_TYPES[DEFAULT_AMMO_PROFILE_KEY];
}
