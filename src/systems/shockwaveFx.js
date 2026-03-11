import * as THREE from 'three';

const FORWARD = new THREE.Vector3(0, 0, 1);
const TMP_DIR = new THREE.Vector3();

const POOL_SIZE = 8;
const MIN_DURATION = 0.24;
const MAX_DURATION = 0.34;
const MIN_ALPHA = 0.14;
const MAX_ALPHA = 0.22;
const BODY_ALPHA_MULT = 0.32;
const RING_COUNT = 3;
const RING_BASE_LAG = 0.16;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function easeOutCubic(t) {
  const p = 1 - t;
  return 1 - p * p * p;
}

function createWaveMesh() {
  const geometry = new THREE.ConeGeometry(1, 1, 18, 1, true);
  geometry.rotateX(Math.PI / 2);
  geometry.rotateY(Math.PI);

  const bodyMaterial = new THREE.MeshBasicMaterial({
    color: 0x88ccff,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const coneMesh = new THREE.Mesh(geometry, bodyMaterial);
  coneMesh.visible = false;
  coneMesh.frustumCulled = false;
  coneMesh.renderOrder = 6;

  const ringGeometry = new THREE.TorusGeometry(1, 0.06, 10, 30);
  const ringMeshes = [];
  const ringMaterials = [];

  for (let i = 0; i < RING_COUNT; i++) {
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x88ccff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
    ringMesh.visible = false;
    ringMesh.frustumCulled = false;
    ringMesh.renderOrder = 7 + i;

    ringMeshes.push(ringMesh);
    ringMaterials.push(ringMaterial);
  }

  return {
    coneMesh,
    ringMeshes,
    bodyMaterial,
    ringMaterials,
  };
}

function createWaveInstance(scene) {
  const root = new THREE.Group();
  const { coneMesh, ringMeshes, bodyMaterial, ringMaterials } = createWaveMesh();
  root.visible = false;
  root.add(coneMesh);
  for (let i = 0; i < ringMeshes.length; i++) {
    root.add(ringMeshes[i]);
  }
  scene.add(root);

  return {
    root,
    coneMesh,
    ringMeshes,
    bodyMaterial,
    ringMaterials,
    active: false,
    elapsed: 0,
    duration: MIN_DURATION,
    targetLength: 0,
    coneHalfAngle: Math.PI / 4,
    peakAlpha: MIN_ALPHA,
    ringLagStep: RING_BASE_LAG,
    ringThickness: 0.06,
    swirlPhase: 0,
    swirlSpeed: 0,
  };
}

export function createShockwaveFx(scene) {
  const pool = [];

  function ensurePool() {
    while (pool.length < POOL_SIZE) {
      pool.push(createWaveInstance(scene));
    }
  }

  function acquireWave() {
    ensurePool();

    for (let i = 0; i < pool.length; i++) {
      if (!pool[i].active) {
        return pool[i];
      }
    }

    // Reuse the wave closest to completion when at pool capacity.
    let oldest = pool[0];
    let highestProgress = -1;
    for (let i = 0; i < pool.length; i++) {
      const wave = pool[i];
      const progress = wave.duration > 0 ? wave.elapsed / wave.duration : 0;
      if (progress > highestProgress) {
        highestProgress = progress;
        oldest = wave;
      }
    }

    return oldest;
  }

  function spawnMuzzleWave(origin, direction, ammoConfig = {}, _hitInfo = null) {
    if (!origin || !direction) return;

    TMP_DIR.copy(direction);
    if (TMP_DIR.lengthSq() < 0.0001) return;
    TMP_DIR.normalize();

    // Match the gameplay shockwave volume exactly: a cone defined by ammo radius + coneHalfAngle.
    // We intentionally ignore raycast hit distance because shockwave force checks are not wall-occluded.
    const maxRange = Number.isFinite(ammoConfig.radius) ? ammoConfig.radius : 5;
    const targetLength = clamp(maxRange, 0.2, maxRange);

    const coneHalfAngle = Number.isFinite(ammoConfig.coneHalfAngle)
      ? ammoConfig.coneHalfAngle
      : Math.PI / 4;

    const wave = acquireWave();
    const jitter = Math.random();
    wave.active = true;
    wave.elapsed = 0;
    wave.duration = MIN_DURATION + (MAX_DURATION - MIN_DURATION) * jitter;
    wave.targetLength = targetLength;
    wave.coneHalfAngle = coneHalfAngle;
    wave.peakAlpha = clamp(MIN_ALPHA + (MAX_ALPHA - MIN_ALPHA) * Math.random(), MIN_ALPHA, MAX_ALPHA);
    wave.ringLagStep = clamp(RING_BASE_LAG + (Math.random() - 0.5) * 0.03, 0.12, 0.2);
    wave.ringThickness = 0.045 + Math.random() * 0.018;
    wave.swirlPhase = Math.random() * Math.PI * 2;
    wave.swirlSpeed = 3.6 + Math.random() * 2.4;

    wave.bodyMaterial.color.set(ammoConfig.visualColor || 0x88ccff);
    for (let i = 0; i < wave.ringMaterials.length; i++) {
      wave.ringMaterials[i].color.set(ammoConfig.visualColor || 0x88ccff);
      wave.ringMaterials[i].opacity = 0;
    }
    wave.bodyMaterial.opacity = 0;

    wave.root.position.copy(origin);
    wave.root.quaternion.setFromUnitVectors(FORWARD, TMP_DIR);
    wave.root.visible = true;

    wave.coneMesh.visible = true;
    wave.coneMesh.position.set(0, 0, 0.01);
    wave.coneMesh.scale.set(0.01, 0.01, 0.01);
    for (let i = 0; i < wave.ringMeshes.length; i++) {
      wave.ringMeshes[i].visible = true;
      wave.ringMeshes[i].position.set(0, 0, 0.01);
      wave.ringMeshes[i].scale.set(0.01, 0.01, 1);
    }
  }

  function update(dt) {
    for (let i = 0; i < pool.length; i++) {
      const wave = pool[i];
      if (!wave.active) continue;

      wave.elapsed += dt;
      const t = clamp(wave.elapsed / wave.duration, 0, 1);

      if (t >= 1) {
        wave.active = false;
        wave.root.visible = false;
        wave.coneMesh.visible = false;
        for (let i = 0; i < wave.ringMeshes.length; i++) {
          wave.ringMeshes[i].visible = false;
        }
        wave.bodyMaterial.opacity = 0;
        for (let i = 0; i < wave.ringMaterials.length; i++) {
          wave.ringMaterials[i].opacity = 0;
        }
        continue;
      }

      const growth = easeOutCubic(t);
      const length = Math.max(0.01, wave.targetLength * growth);
      const radius = Math.max(0.01, Math.tan(wave.coneHalfAngle) * length);
      const fade = (1 - t) * (1 - t);

      wave.bodyMaterial.opacity = wave.peakAlpha * BODY_ALPHA_MULT * fade;

      wave.coneMesh.position.set(0, 0, length * 0.5);
      wave.coneMesh.scale.set(radius, radius, length);

      for (let i = 0; i < wave.ringMeshes.length; i++) {
        const ringMesh = wave.ringMeshes[i];
        const ringMat = wave.ringMaterials[i];
        const lag = i * wave.ringLagStep;

        if (t <= lag) {
          ringMat.opacity = 0;
          ringMesh.visible = false;
          continue;
        }

        ringMesh.visible = true;
        const ringT = clamp((t - lag) / (1 - lag), 0, 1);
        const ringGrowth = easeOutCubic(ringT);
        const ringLength = Math.max(0.01, wave.targetLength * ringGrowth);
        const ringRadius = Math.max(0.01, Math.tan(wave.coneHalfAngle) * ringLength);
        const ringFade = (1 - ringT) * (1 - ringT);
        const ringWeight = 1 - i * 0.24;
        const swirl = (1 - ringT) * wave.ringThickness;
        const swirlPhase = wave.swirlPhase + wave.elapsed * wave.swirlSpeed + i * 1.6;

        ringMat.opacity = wave.peakAlpha * ringWeight * ringFade;
        ringMesh.position.set(
          Math.cos(swirlPhase) * swirl,
          Math.sin(swirlPhase * 0.85) * swirl * 0.7,
          ringLength,
        );
        ringMesh.scale.set(ringRadius, ringRadius, 1);
      }
    }
  }

  function clear() {
    for (let i = 0; i < pool.length; i++) {
      const wave = pool[i];
      wave.active = false;
      wave.root.visible = false;
      wave.coneMesh.visible = false;
      for (let j = 0; j < wave.ringMeshes.length; j++) {
        wave.ringMeshes[j].visible = false;
      }
      wave.bodyMaterial.opacity = 0;
      for (let j = 0; j < wave.ringMaterials.length; j++) {
        wave.ringMaterials[j].opacity = 0;
      }
    }
  }

  return {
    spawnMuzzleWave,
    update,
    clear,
  };
}
