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
  const microMotion = options.microMotion ?? 1;
  const maxSwing = options.maxSwing ?? 0.075;
  const maxImpulse = options.maxImpulse ?? 2.2;
  const chimeResponse = options.chimeResponse ?? 1;
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
            response: (0.7 + seededUnit(seed, 30 + index) * 0.7) * chimeResponse,
            follow: 9.5 + seededUnit(seed, 32 + index) * 2.5,
            damping: 5.6 + seededUnit(seed, 34 + index) * 1.8,
            maxAngle: 0.11,
            biasX: seededUnit(seed, 36 + index) * 2 - 1,
            biasZ: seededUnit(seed, 38 + index) * 2 - 1,
            swingX: 0,
            swingZ: 0,
            velX: 0,
            velZ: 0,
          }))
        : [];

      const armData = Array.isArray(chandelier.arms)
        ? chandelier.arms.map((mesh, index) => ({
            mesh,
            phase: seededUnit(seed, 40 + index) * Math.PI * 2,
            amp: 0.0018 + seededUnit(seed, 50 + index) * 0.0012,
            response: (0.55 + seededUnit(seed, 52 + index) * 0.45) * chimeResponse,
            follow: 8.2 + seededUnit(seed, 54 + index) * 2.3,
            damping: 6.2 + seededUnit(seed, 56 + index) * 1.8,
            maxAngle: 0.075,
            biasX: seededUnit(seed, 58 + index) * 2 - 1,
            biasZ: seededUnit(seed, 60 + index) * 2 - 1,
            swingX: 0,
            swingZ: 0,
            velX: 0,
            velZ: 0,
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
            response: (0.5 + seededUnit(seed, 82 + index) * 0.5) * chimeResponse,
            follow: 9.0 + seededUnit(seed, 84 + index) * 2.4,
            damping: 6.8 + seededUnit(seed, 86 + index) * 1.6,
            maxOffset: 0.06,
            biasX: seededUnit(seed, 88 + index) * 2 - 1,
            biasZ: seededUnit(seed, 90 + index) * 2 - 1,
            offsetX: 0,
            offsetZ: 0,
            velX: 0,
            velZ: 0,
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
            response: 0.8 * chimeResponse,
            follow: 8.4,
            damping: 6.3,
            maxOffset: 0.08,
            offsetX: 0,
            offsetZ: 0,
            velX: 0,
            velZ: 0,
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
        const targetX = -inst.angleX * (0.35 + chain.response * 0.5);
        const targetZ = -inst.angleZ * (0.35 + chain.response * 0.5);
        chain.velX += (targetX - chain.swingX) * chain.follow * frameDt;
        chain.velZ += (targetZ - chain.swingZ) * chain.follow * frameDt;
        const chainDamp = Math.max(0, 1 - chain.damping * frameDt);
        chain.velX *= chainDamp;
        chain.velZ *= chainDamp;
        chain.swingX += chain.velX * frameDt;
        chain.swingZ += chain.velZ * frameDt;
        chain.swingX = Math.max(-chain.maxAngle, Math.min(chain.maxAngle, chain.swingX));
        chain.swingZ = Math.max(-chain.maxAngle, Math.min(chain.maxAngle, chain.swingZ));

        const micro = Math.sin(t * 2.2 + chain.phase) * chain.amp * microMotion;
        chain.mesh.rotation.x = secondaryX * 0.35 + chain.swingX + micro * 0.45;
        chain.mesh.rotation.z = secondaryZ * 0.35 + chain.swingZ - micro * 0.35;
      }

      for (let j = 0; j < inst.armData.length; j++) {
        const arm = inst.armData[j];
        const targetX = -inst.angleX * (0.24 + arm.response * 0.42);
        const targetZ = -inst.angleZ * (0.24 + arm.response * 0.42);
        arm.velX += (targetX - arm.swingX) * arm.follow * frameDt;
        arm.velZ += (targetZ - arm.swingZ) * arm.follow * frameDt;
        const armDamp = Math.max(0, 1 - arm.damping * frameDt);
        arm.velX *= armDamp;
        arm.velZ *= armDamp;
        arm.swingX += arm.velX * frameDt;
        arm.swingZ += arm.velZ * frameDt;
        arm.swingX = Math.max(-arm.maxAngle, Math.min(arm.maxAngle, arm.swingX));
        arm.swingZ = Math.max(-arm.maxAngle, Math.min(arm.maxAngle, arm.swingZ));

        const lag = Math.sin(t * 1.8 + arm.phase) * arm.amp * microMotion;
        arm.mesh.rotation.x = secondaryX * 0.4 + arm.swingX + lag;
        arm.mesh.rotation.z = secondaryZ * 0.4 + arm.swingZ - lag * 0.35;
      }

      for (let j = 0; j < inst.bulbData.length; j++) {
        const bulb = inst.bulbData[j];
        const targetOffsetX = -inst.partLagX * (0.03 + bulb.response * 0.035);
        const targetOffsetZ = -inst.partLagZ * (0.03 + bulb.response * 0.035);
        bulb.velX += (targetOffsetX - bulb.offsetX) * bulb.follow * frameDt;
        bulb.velZ += (targetOffsetZ - bulb.offsetZ) * bulb.follow * frameDt;
        const bulbDamp = Math.max(0, 1 - bulb.damping * frameDt);
        bulb.velX *= bulbDamp;
        bulb.velZ *= bulbDamp;
        bulb.offsetX += bulb.velX * frameDt;
        bulb.offsetZ += bulb.velZ * frameDt;
        bulb.offsetX = Math.max(-bulb.maxOffset, Math.min(bulb.maxOffset, bulb.offsetX));
        bulb.offsetZ = Math.max(-bulb.maxOffset, Math.min(bulb.maxOffset, bulb.offsetZ));

        const drift = Math.sin(t * 1.9 + bulb.phase) * bulb.amp * microMotion;
        bulb.mesh.position.x = bulb.baseX + secondaryX * 0.2 + bulb.offsetX + drift * 0.3;
        bulb.mesh.position.y = bulb.baseY + Math.cos(t * 2.0 + bulb.phase) * bulb.amp * 0.2
          - (Math.abs(bulb.offsetX) + Math.abs(bulb.offsetZ)) * 0.05;
        bulb.mesh.position.z = bulb.baseZ + secondaryZ * 0.2 + bulb.offsetZ - drift * 0.22;
      }

      if (inst.mainBulbData) {
        const mainBulb = inst.mainBulbData;
        const mainTargetX = -inst.partLagX * (0.045 + mainBulb.response * 0.04);
        const mainTargetZ = -inst.partLagZ * (0.045 + mainBulb.response * 0.04);
        mainBulb.velX += (mainTargetX - mainBulb.offsetX) * mainBulb.follow * frameDt;
        mainBulb.velZ += (mainTargetZ - mainBulb.offsetZ) * mainBulb.follow * frameDt;
        const mainDamp = Math.max(0, 1 - mainBulb.damping * frameDt);
        mainBulb.velX *= mainDamp;
        mainBulb.velZ *= mainDamp;
        mainBulb.offsetX += mainBulb.velX * frameDt;
        mainBulb.offsetZ += mainBulb.velZ * frameDt;
        mainBulb.offsetX = Math.max(-mainBulb.maxOffset, Math.min(mainBulb.maxOffset, mainBulb.offsetX));
        mainBulb.offsetZ = Math.max(-mainBulb.maxOffset, Math.min(mainBulb.maxOffset, mainBulb.offsetZ));

        const drift = Math.sin(t * 1.5 + mainBulb.phase) * mainBulb.amp * microMotion;
        mainBulb.mesh.position.x = mainBulb.baseX + secondaryX * 0.3 + mainBulb.offsetX + drift * 0.25;
        mainBulb.mesh.position.y = mainBulb.baseY + Math.cos(t * 1.7 + mainBulb.phase) * mainBulb.amp * 0.18
          - (Math.abs(mainBulb.offsetX) + Math.abs(mainBulb.offsetZ)) * 0.06;
        mainBulb.mesh.position.z = mainBulb.baseZ + secondaryZ * 0.3 + mainBulb.offsetZ - drift * 0.22;
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
    const clampedX = Math.max(-maxImpulse, Math.min(maxImpulse, impulseX));
    const clampedZ = Math.max(-maxImpulse, Math.min(maxImpulse, impulseZ));
    inst.velX += clampedX;
    inst.velZ += clampedZ;

    const impulseMag = Math.hypot(clampedX, clampedZ);
    const partImpulse = impulseMag * 0.34;

    for (let i = 0; i < inst.chainData.length; i++) {
      const chain = inst.chainData[i];
      chain.velX += clampedX * (0.18 + chain.response * 0.2) + chain.biasX * partImpulse * 0.08;
      chain.velZ += clampedZ * (0.18 + chain.response * 0.2) + chain.biasZ * partImpulse * 0.08;
    }

    for (let i = 0; i < inst.armData.length; i++) {
      const arm = inst.armData[i];
      arm.velX += clampedX * (0.12 + arm.response * 0.16) + arm.biasX * partImpulse * 0.06;
      arm.velZ += clampedZ * (0.12 + arm.response * 0.16) + arm.biasZ * partImpulse * 0.06;
    }

    for (let i = 0; i < inst.bulbData.length; i++) {
      const bulb = inst.bulbData[i];
      bulb.velX += clampedX * (0.08 + bulb.response * 0.12) + bulb.biasX * partImpulse * 0.04;
      bulb.velZ += clampedZ * (0.08 + bulb.response * 0.12) + bulb.biasZ * partImpulse * 0.04;
    }

    if (inst.mainBulbData) {
      const mainBulb = inst.mainBulbData;
      mainBulb.velX += clampedX * 0.16;
      mainBulb.velZ += clampedZ * 0.16;
    }

    const boostedMaxSwing = Math.min(0.42, maxSwing + impulseMag * 0.18);
    inst.maxSwingOverride = Math.max(inst.maxSwingOverride, boostedMaxSwing);
    inst.overrideDecayDuration = 2.4;
    inst.overrideDecayTimer = 2.4;
  }

  return {
    update,
    applyImpulse,
  };
}
