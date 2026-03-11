function fract(value) {
  return value - Math.floor(value);
}

function seededUnit(seed, offset) {
  return fract(Math.sin(seed * 127.1 + offset * 311.7) * 43758.5453123);
}

export function createChandelierMotionSystem(chandeliers, options = {}) {
  const instances = [];
  let elapsed = 0;

  const gravityRestore = options.gravityRestore ?? 3.9;
  const damping = options.damping ?? 2.1;
  const breezeStrengthX = options.breezeStrengthX ?? 0.12;
  const breezeStrengthZ = options.breezeStrengthZ ?? 0.16;
  const breezeFreq = options.breezeFreq ?? 0.42;
  const maxSwing = options.maxSwing ?? 0.075;
  const partFollow = options.partFollow ?? 0.75;
  const partDamping = options.partDamping ?? 8.0;

  if (Array.isArray(chandeliers)) {
    for (let i = 0; i < chandeliers.length; i++) {
      const chandelier = chandeliers[i];
      if (!chandelier || !chandelier.group) continue;

      const seed = Number.isFinite(chandelier.seed) ? chandelier.seed : (i + 1);
      const phase = seededUnit(seed, 1) * Math.PI * 2;
      const phase2 = seededUnit(seed, 2) * Math.PI * 2;
      const freqScale = 0.9 + seededUnit(seed, 3) * 0.25;
      const secondaryScale = 0.6 + seededUnit(seed, 4) * 0.5;

      const chainData = Array.isArray(chandelier.chains)
        ? chandelier.chains.map((mesh, index) => ({
            mesh,
            phase: seededUnit(seed, 10 + index) * Math.PI * 2,
            amp: 0.0025 + seededUnit(seed, 20 + index) * 0.0018,
          }))
        : [];

      const armData = Array.isArray(chandelier.arms)
        ? chandelier.arms.map((mesh, index) => ({
            mesh,
            phase: seededUnit(seed, 40 + index) * Math.PI * 2,
            amp: 0.0018 + seededUnit(seed, 50 + index) * 0.0012,
          }))
        : [];

      const bulbData = Array.isArray(chandelier.bulbs)
        ? chandelier.bulbs.map((mesh, index) => ({
            mesh,
            baseX: mesh.position.x,
            baseY: mesh.position.y,
            baseZ: mesh.position.z,
            phase: seededUnit(seed, 70 + index) * Math.PI * 2,
            amp: 0.008 + seededUnit(seed, 80 + index) * 0.004,
          }))
        : [];

      const mainBulbData = chandelier.mainBulb
        ? {
            mesh: chandelier.mainBulb,
            baseX: chandelier.mainBulb.position.x,
            baseY: chandelier.mainBulb.position.y,
            baseZ: chandelier.mainBulb.position.z,
            phase: seededUnit(seed, 95) * Math.PI * 2,
            amp: 0.01,
          }
        : null;

      instances.push({
        group: chandelier.group,
        light: chandelier.light || null,
        lightBaseIntensity: chandelier.light ? chandelier.light.intensity : 0,
        phase,
        phase2,
        freqScale,
        secondaryScale,
        angleX: 0,
        angleZ: 0,
        velX: 0,
        velZ: 0,
        partLagX: 0,
        partLagZ: 0,
        chainData,
        armData,
        bulbData,
        mainBulbData,
        maxSwingOverride: maxSwing,
        overrideDecayTimer: 0,
        overrideDecayDuration: 2.0,
      });
    }
  }

  function update(dt) {
    if (instances.length === 0) return;

    const frameDt = Math.min(dt, 0.05);
    elapsed += frameDt;

    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i];
      const t = elapsed * breezeFreq * inst.freqScale;

      const windX = Math.sin(t + inst.phase) * breezeStrengthX
        + Math.sin(t * 0.63 + inst.phase2) * (breezeStrengthX * 0.45);
      const windZ = Math.cos(t * 0.87 + inst.phase2) * breezeStrengthZ
        + Math.sin(t * 0.51 + inst.phase) * (breezeStrengthZ * 0.35);

      // Pendulum-like angular acceleration: gravity restore + damping + external breeze.
      const accX = (-gravityRestore * inst.angleX) - (damping * inst.velX) + windX;
      const accZ = (-gravityRestore * inst.angleZ) - (damping * inst.velZ) + windZ;

      inst.velX += accX * frameDt;
      inst.velZ += accZ * frameDt;
      inst.angleX += inst.velX * frameDt;
      inst.angleZ += inst.velZ * frameDt;

      // Dynamic max swing: use override if active, otherwise default
      let effectiveMaxSwing = maxSwing;
      if (inst.overrideDecayTimer > 0) {
        inst.overrideDecayTimer -= frameDt;
        const blend = Math.max(0, inst.overrideDecayTimer / inst.overrideDecayDuration);
        effectiveMaxSwing = maxSwing + (inst.maxSwingOverride - maxSwing) * blend;
      }

      inst.angleX = Math.max(-effectiveMaxSwing, Math.min(effectiveMaxSwing, inst.angleX));
      inst.angleZ = Math.max(-effectiveMaxSwing, Math.min(effectiveMaxSwing, inst.angleZ));

      // Secondary parts softly follow swing with their own damping.
      const targetLagX = inst.angleX * partFollow;
      const targetLagZ = inst.angleZ * partFollow;
      inst.partLagX += (targetLagX - inst.partLagX) * Math.min(1, partDamping * frameDt);
      inst.partLagZ += (targetLagZ - inst.partLagZ) * Math.min(1, partDamping * frameDt);

      const swayX = inst.angleX;
      const swayZ = inst.angleZ;

      inst.group.rotation.x = swayX;
      inst.group.rotation.z = swayZ;

      const secondaryX = inst.partLagX * inst.secondaryScale;
      const secondaryZ = inst.partLagZ * inst.secondaryScale;

      for (let j = 0; j < inst.chainData.length; j++) {
        const chain = inst.chainData[j];
        const micro = Math.sin(t * 2.2 + chain.phase) * chain.amp;
        chain.mesh.rotation.x = secondaryX + micro * 0.5;
        chain.mesh.rotation.z = secondaryZ - micro * 0.4;
      }

      for (let j = 0; j < inst.armData.length; j++) {
        const arm = inst.armData[j];
        const lag = Math.sin(t * 1.8 + arm.phase) * arm.amp;
        arm.mesh.rotation.x = secondaryX * 0.75 + lag;
        arm.mesh.rotation.z = secondaryZ * 0.75 - lag * 0.4;
      }

      for (let j = 0; j < inst.bulbData.length; j++) {
        const bulb = inst.bulbData[j];
        const drift = Math.sin(t * 1.9 + bulb.phase) * bulb.amp;
        bulb.mesh.position.x = bulb.baseX + secondaryX * 0.35 + drift * 0.35;
        bulb.mesh.position.y = bulb.baseY + Math.cos(t * 2.0 + bulb.phase) * bulb.amp * 0.2;
        bulb.mesh.position.z = bulb.baseZ + secondaryZ * 0.35 - drift * 0.25;
      }

      if (inst.mainBulbData) {
        const mainBulb = inst.mainBulbData;
        const drift = Math.sin(t * 1.5 + mainBulb.phase) * mainBulb.amp;
        mainBulb.mesh.position.x = mainBulb.baseX + secondaryX * 0.55 + drift * 0.3;
        mainBulb.mesh.position.y = mainBulb.baseY + Math.cos(t * 1.7 + mainBulb.phase) * mainBulb.amp * 0.18;
        mainBulb.mesh.position.z = mainBulb.baseZ + secondaryZ * 0.55 - drift * 0.25;
      }

      if (inst.light) {
        // Tiny intensity pulse keeps lights alive without obvious flicker.
        const pulse = Math.sin(t * 1.5 + inst.phase2) * 0.06;
        inst.light.intensity = inst.lightBaseIntensity + pulse;
      }
    }
  }

  /** Apply an external impulse to a chandelier (e.g. from a shockwave). */
  function applyImpulse(index, impulseX, impulseZ) {
    if (index < 0 || index >= instances.length) return;
    const inst = instances[index];
    inst.velX += impulseX;
    inst.velZ += impulseZ;
    inst.maxSwingOverride = 0.4;
    inst.overrideDecayDuration = 2.0;
    inst.overrideDecayTimer = 2.0;
  }

  return {
    update,
    applyImpulse,
  };
}
