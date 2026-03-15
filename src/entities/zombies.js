import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const enemyTextureLoader = new THREE.TextureLoader();
const enemyTextureCache = new Map();

function getEnemyTexture(path) {
  if (enemyTextureCache.has(path)) return enemyTextureCache.get(path);

  const texture = enemyTextureLoader.load(path);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  enemyTextureCache.set(path, texture);
  return texture;
}

function setShadowFlags(root, enabled = true) {
  root.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = enabled;
      child.receiveShadow = enabled;
    }
  });
}

export function createEnemyContainer({ type = 'enemy', hp = 1, name = 'Enemy' } = {}) {
  const mesh = new THREE.Group();
  mesh.name = name;
  return {
    mesh,
    type,
    hp,
    state: {},
    components: {},
  };
}

/**
 * Attaches standard AI-ready components to a bare enemy object
 * returned by archetype creators (shambler, guard, etc.).
 * homeZone and aggroDepth should be set after calling this, or at spawn time.
 */
export function attachEnemyComponents(entity, options = {}) {
  const moveSpeed = options.moveSpeed ?? 0.75;
  const turnSpeed = options.turnSpeed ?? 2.2;
  const homeZone = options.homeZone ?? 'lobby';
  const aggroDepth = options.aggroDepth ?? 2;

  if (!entity.state) entity.state = {};
  if (!entity.components) entity.components = {};

  entity.components.visual = entity.components.visual || {
    style: 'ps1-pixel',
    rigProfile: {
      skeletonType: 'humanoid-zombie',
      rootBone: 'hips',
      facingAxis: '-z',
    },
  };

  entity.components.animation = entity.components.animation || {
    state: 'idle',
    states: ['idle', 'walk', 'attack', 'hit', 'death'],
    clips: {},
    mixer: null,
  };

  entity.components.pathing = {
    mode: 'none',
    moveSpeed,
    turnSpeed,
    homeZone,
    aggroDepth,
    targetPosition: null,
    desiredVelocity: new THREE.Vector3(),
    navigation: {
      probeDistance: 0.65,
      clearancePadding: 0.02,
      minClearanceRatio: 0.12,
      steerAngleStep: 0.35,
      maxSteerAngle: 1.4,
    },
  };

  entity.components.controller = entity.components.controller || {
    time: 0,
    update(dt) {
      this.time += dt;
      entity.mesh.position.y += Math.sin(this.time * 1.25) * 0.0001; // micro idle bob
    },
  };

  entity.components.health = {
    current: entity.hp,
    max: entity.hp,
    dead: false,
  };

  entity.components.knockback = entity.components.knockback || {
    velocity: new THREE.Vector3(),
    active: false,
  };

  return entity;
}

/**
 * Pixel art texture generator for zombie faces.
 * Creates a 32x32 canvas texture with a base color and optional detail painting.
 */
function makeZombieTexture(baseHex, detailFn) {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');

  // Fill base color
  ctx.fillStyle = '#' + baseHex.toString(16).padStart(6, '0');
  ctx.fillRect(0, 0, 32, 32);

  // Apply optional detail painting (wounds, veins, cracks, etc.)
  if (detailFn) detailFn(ctx);

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
}

/**
 * Type 1: The Shambler
 * Classic rotting zombie with decomposed flesh and tattered rags.
 * Hunched posture, asymmetric arms.
 */
export function createShambler(scene) {
  const group = new THREE.Group();

  // Materials
  const skinMat = new THREE.MeshStandardMaterial({
    map: makeZombieTexture(0x7a8c6e, (ctx) => {
      // Mottled bruising and dark spots
      ctx.fillStyle = '#5c6e50';
      for (let i = 0; i < 15; i++) {
        ctx.fillRect(
          Math.random() * 32,
          Math.random() * 32,
          2 + Math.random() * 4,
          2 + Math.random() * 4
        );
      }
      // Dark wound lines
      ctx.strokeStyle = '#8b2020';
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(Math.random() * 32, Math.random() * 32);
        ctx.lineTo(Math.random() * 32, Math.random() * 32);
        ctx.stroke();
      }
    }),
    roughness: 0.95,
    metalness: 0,
  });

  const ragMat = new THREE.MeshStandardMaterial({
    map: makeZombieTexture(0x3a2e28, (ctx) => {
      // Tattered cloth texture
      ctx.fillStyle = '#2a1e18';
      for (let i = 0; i < 20; i++) {
        ctx.fillRect(
          Math.random() * 32,
          Math.random() * 32,
          1 + Math.random() * 3,
          1 + Math.random() * 3
        );
      }
    }),
    roughness: 0.9,
    metalness: 0,
  });

  const boneMat = new THREE.MeshStandardMaterial({
    color: 0xc8b87a,
    roughness: 0.7,
    metalness: 0,
  });

  // Head
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 0.35), skinMat);
  head.position.set(0, 1.4, 0);
  head.castShadow = true;
  head.receiveShadow = true;
  group.add(head);

  // Torso (hunched forward ~15 degrees)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.3), skinMat);
  torso.position.set(0, 0.8, 0);
  torso.rotation.z = 0.26; // ~15 degrees forward
  torso.castShadow = true;
  torso.receiveShadow = true;
  group.add(torso);

  // Torso rags overlay
  const ragTorso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.32), ragMat);
  ragTorso.position.set(0, 0.8, -0.02);
  ragTorso.rotation.z = 0.26;
  ragTorso.castShadow = true;
  ragTorso.receiveShadow = true;
  group.add(ragTorso);

  // Left arm (hanging low)
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.65, 0.15), skinMat);
  armL.position.set(-0.35, 0.5, 0);
  armL.rotation.z = 0.3;
  armL.castShadow = true;
  armL.receiveShadow = true;
  group.add(armL);

  // Right arm (reaching forward)
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.55, 0.15), skinMat);
  armR.position.set(0.35, 0.9, -0.3);
  armR.rotation.z = -0.4;
  armR.castShadow = true;
  armR.receiveShadow = true;
  group.add(armR);

  // Left thigh
  const thighL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.4, 0.18), skinMat);
  thighL.position.set(-0.15, 0.2, 0);
  thighL.castShadow = true;
  thighL.receiveShadow = true;
  group.add(thighL);

  // Right thigh
  const thighR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.4, 0.18), skinMat);
  thighR.position.set(0.15, 0.2, 0);
  thighR.castShadow = true;
  thighR.receiveShadow = true;
  group.add(thighR);

  // Leg rags
  const ragLegs = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.5, 0.32), ragMat);
  ragLegs.position.set(0, 0.15, -0.02);
  ragLegs.castShadow = true;
  ragLegs.receiveShadow = true;
  group.add(ragLegs);

  // Feet
  const footL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.25), boneMat);
  footL.position.set(-0.15, -0.08, 0.05);
  footL.castShadow = true;
  footL.receiveShadow = true;
  group.add(footL);

  const footR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.25), boneMat);
  footR.position.set(0.15, -0.08, 0.05);
  footR.castShadow = true;
  footR.receiveShadow = true;
  group.add(footR);

  scene.add(group);
  return { mesh: group, type: 'shambler', hp: 5 };
}

/**
 * Type 2: The Guard
 * Tall military zombie with tactical vest and uniform remnants.
 * Upright posture, rigid presence.
 */
export function createGuard(scene) {
  const group = new THREE.Group();

  // Materials
  const uniformMat = new THREE.MeshStandardMaterial({
    map: makeZombieTexture(0x4a5c3a, (ctx) => {
      ctx.fillStyle = '#3a4c2a';
      for (let i = 0; i < 10; i++) {
        ctx.fillRect(Math.random() * 32, Math.random() * 32, 2, 2);
      }
    }),
    roughness: 0.85,
    metalness: 0,
  });

  const vestMat = new THREE.MeshStandardMaterial({
    map: makeZombieTexture(0x2d2d2d, (ctx) => {
      // Tactical gear pattern
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(2, 2, 28, 28);
      ctx.fillStyle = '#3d3d3d';
      for (let i = 0; i < 8; i++) {
        ctx.fillRect(6 + i * 3, 8, 2, 12);
      }
    }),
    roughness: 0.5,
    metalness: 0.3,
  });

  const skinMat = new THREE.MeshStandardMaterial({
    color: 0x5c6e50,
    roughness: 0.95,
    metalness: 0,
  });

  const beltMat = new THREE.MeshStandardMaterial({
    color: 0x8b7355,
    roughness: 0.6,
    metalness: 0.4,
  });

  // Head
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.38, 0.32), uniformMat);
  head.position.set(0, 1.65, 0);
  head.castShadow = true;
  head.receiveShadow = true;
  group.add(head);

  // Neck/collar
  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.28), uniformMat);
  collar.position.set(0, 1.3, 0);
  collar.castShadow = true;
  collar.receiveShadow = true;
  group.add(collar);

  // Torso base
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.65, 0.3), skinMat);
  torso.position.set(0, 0.75, 0);
  torso.castShadow = true;
  torso.receiveShadow = true;
  group.add(torso);

  // Tactical vest overlay
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.67, 0.32), vestMat);
  vest.position.set(0, 0.75, -0.02);
  vest.castShadow = true;
  vest.receiveShadow = true;
  group.add(vest);

  // Belt pouches (tiny boxes)
  const pouch1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.2), beltMat);
  pouch1.position.set(-0.18, 0.4, -0.15);
  pouch1.castShadow = true;
  pouch1.receiveShadow = true;
  group.add(pouch1);

  const pouch2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.2), beltMat);
  pouch2.position.set(0.18, 0.4, -0.15);
  pouch2.castShadow = true;
  pouch2.receiveShadow = true;
  group.add(pouch2);

  // Arms (upright, straight)
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.62, 0.14), uniformMat);
  armL.position.set(-0.32, 0.85, 0);
  armL.castShadow = true;
  armL.receiveShadow = true;
  group.add(armL);

  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.62, 0.14), uniformMat);
  armR.position.set(0.32, 0.85, 0);
  armR.castShadow = true;
  armR.receiveShadow = true;
  group.add(armR);

  // Thighs
  const thighL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.45, 0.18), uniformMat);
  thighL.position.set(-0.15, 0.2, 0);
  thighL.castShadow = true;
  thighL.receiveShadow = true;
  group.add(thighL);

  const thighR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.45, 0.18), uniformMat);
  thighR.position.set(0.15, 0.2, 0);
  thighR.castShadow = true;
  thighR.receiveShadow = true;
  group.add(thighR);

  // Shins
  const shinL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.35, 0.16), uniformMat);
  shinL.position.set(-0.15, -0.15, 0);
  shinL.castShadow = true;
  shinL.receiveShadow = true;
  group.add(shinL);

  const shinR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.35, 0.16), uniformMat);
  shinR.position.set(0.15, -0.15, 0);
  shinR.castShadow = true;
  shinR.receiveShadow = true;
  group.add(shinR);

  // Feet
  const footL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.28), beltMat);
  footL.position.set(-0.15, -0.55, 0.05);
  footL.castShadow = true;
  footL.receiveShadow = true;
  group.add(footL);

  const footR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.28), beltMat);
  footR.position.set(0.15, -0.55, 0.05);
  footR.castShadow = true;
  footR.receiveShadow = true;
  group.add(footR);

  scene.add(group);
  return { mesh: group, type: 'guard', hp: 7 };
}

/**
 * Type 3: The Bloat
 * Grotesquely distended zombie with stretched necrotic flesh.
 * Very wide/tall torso, tiny arms and stubby legs. Low and wide frame.
 */
export function createBloat(scene) {
  const group = new THREE.Group();

  // Materials
  const bloatMat = new THREE.MeshStandardMaterial({
    map: makeZombieTexture(0xb8a840, (ctx) => {
      // Stretched vein lines
      ctx.strokeStyle = '#6b8c3a';
      ctx.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        const x1 = Math.random() * 32;
        const y1 = Math.random() * 32;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 + (Math.random() - 0.5) * 20, y1 + (Math.random() - 0.5) * 20);
        ctx.stroke();
      }
      // Open sores
      ctx.fillStyle = '#a05020';
      for (let i = 0; i < 6; i++) {
        ctx.fillRect(Math.random() * 32, Math.random() * 32, 2, 2);
      }
    }),
    roughness: 0.88,
    metalness: 0,
  });

  const soreMat = new THREE.MeshStandardMaterial({
    color: 0xa05020,
    roughness: 0.9,
    metalness: 0,
  });

  // Massive head (bloated)
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.38), bloatMat);
  head.position.set(0, 1.15, 0);
  head.castShadow = true;
  head.receiveShadow = true;
  group.add(head);

  // Grotesquely swollen torso (3x wider than normal)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.4), bloatMat);
  torso.position.set(0, 0.35, 0);
  torso.castShadow = true;
  torso.receiveShadow = true;
  group.add(torso);

  // Festering sore on belly
  const sore = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.15, 0.1), soreMat);
  sore.position.set(0, 0.25, -0.25);
  sore.castShadow = true;
  sore.receiveShadow = true;
  group.add(sore);

  // Tiny left arm (comically small)
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.35, 0.1), bloatMat);
  armL.position.set(-0.65, 0.5, 0);
  armL.castShadow = true;
  armL.receiveShadow = true;
  group.add(armL);

  // Tiny right arm
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.35, 0.1), bloatMat);
  armR.position.set(0.65, 0.5, 0);
  armR.castShadow = true;
  armR.receiveShadow = true;
  group.add(armR);

  // Stubby left leg
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.25, 0.16), bloatMat);
  legL.position.set(-0.25, 0.05, 0);
  legL.castShadow = true;
  legL.receiveShadow = true;
  group.add(legL);

  // Stubby right leg
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.25, 0.16), bloatMat);
  legR.position.set(0.25, 0.05, 0);
  legR.castShadow = true;
  legR.receiveShadow = true;
  group.add(legR);

  // Feet
  const footL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.2), bloatMat);
  footL.position.set(-0.25, -0.12, 0.05);
  footL.castShadow = true;
  footL.receiveShadow = true;
  group.add(footL);

  const footR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.2), bloatMat);
  footR.position.set(0.25, -0.12, 0.05);
  footR.castShadow = true;
  footR.receiveShadow = true;
  group.add(footR);

  scene.add(group);
  return { mesh: group, type: 'bloat', hp: 9 };
}

/**
 * Type 4: The Crawler
 * Feral zombie on all fours, near-horizontal body position.
 * Emaciated limbs, blackened mummified flesh. Low to ground, fast.
 */
export function createCrawler(scene) {
  const group = new THREE.Group();

  // Materials
  const charredMat = new THREE.MeshStandardMaterial({
    map: makeZombieTexture(0x2d2520, (ctx) => {
      // Mummified texture
      ctx.fillStyle = '#1a1010';
      for (let i = 0; i < 25; i++) {
        ctx.fillRect(Math.random() * 32, Math.random() * 32, 1, 1);
      }
    }),
    roughness: 0.9,
    metalness: 0,
  });

  const boneMat = new THREE.MeshStandardMaterial({
    color: 0xd4c8a0,
    roughness: 0.7,
    metalness: 0,
  });

  // Horizontal torso (parallel to ground)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 0.5), charredMat);
  torso.position.set(0, 0.25, 0);
  torso.rotation.z = Math.PI / 2; // Horizontal
  torso.castShadow = true;
  torso.receiveShadow = true;
  group.add(torso);

  // Head rotated upward (grotesque neck angle)
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32, 0.28), charredMat);
  head.position.set(0, 0.45, 0.35);
  head.rotation.x = Math.PI / 4; // Look upward
  head.castShadow = true;
  head.receiveShadow = true;
  group.add(head);

  // Front left arm (extended forward like a front leg)
  const armFL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.45, 0.1), charredMat);
  armFL.position.set(-0.2, 0.1, 0.4);
  armFL.rotation.z = 0.3;
  armFL.castShadow = true;
  armFL.receiveShadow = true;
  group.add(armFL);

  // Front right arm
  const armFR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.45, 0.1), charredMat);
  armFR.position.set(0.2, 0.1, 0.4);
  armFR.rotation.z = -0.3;
  armFR.castShadow = true;
  armFR.receiveShadow = true;
  group.add(armFR);

  // Back left leg
  const legBL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.1), charredMat);
  legBL.position.set(-0.2, 0.1, -0.35);
  legBL.castShadow = true;
  legBL.receiveShadow = true;
  group.add(legBL);

  // Back right leg
  const legBR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.1), charredMat);
  legBR.position.set(0.2, 0.1, -0.35);
  legBR.castShadow = true;
  legBR.receiveShadow = true;
  group.add(legBR);

  // Exposed bone knuckles/knees
  const knuckleFL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), boneMat);
  knuckleFL.position.set(-0.2, -0.05, 0.4);
  knuckleFL.castShadow = true;
  knuckleFL.receiveShadow = true;
  group.add(knuckleFL);

  const knuckleFR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), boneMat);
  knuckleFR.position.set(0.2, -0.05, 0.4);
  knuckleFR.castShadow = true;
  knuckleFR.receiveShadow = true;
  group.add(knuckleFR);

  scene.add(group);
  return { mesh: group, type: 'crawler', hp: 3 };
}

/**
 * Type 5: The Charred
 * Burning zombie with pitch-black char and emissive orange cracks.
 * Casts orange light on surroundings. Eerie and unsettling.
 */
export function createCharred(scene) {
  const group = new THREE.Group();

  // Materials
  const charMat = new THREE.MeshStandardMaterial({
    map: makeZombieTexture(0x1a1210, (ctx) => {
      // Crack pattern with emissive glow
      ctx.strokeStyle = '#ff4400';
      ctx.lineWidth = 1.5;
      // Random cracks across the texture
      for (let i = 0; i < 12; i++) {
        const x = Math.random() * 32;
        const y = Math.random() * 32;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let j = 0; j < 3; j++) {
          ctx.lineTo(x + (Math.random() - 0.5) * 15, y + (Math.random() - 0.5) * 15);
        }
        ctx.stroke();
      }
    }),
    roughness: 0.6,
    metalness: 0,
  });

  const emissiveMat = new THREE.MeshStandardMaterial({
    color: 0x1a1210,
    emissive: 0xff4400,
    emissiveIntensity: 0.8,
    roughness: 0.5,
    metalness: 0,
  });

  // Head
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.39, 0.34), emissiveMat);
  head.position.set(0, 1.5, 0);
  head.castShadow = true;
  head.receiveShadow = true;
  group.add(head);

  // Torso (upright, arms slightly raised)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.65, 0.3), charMat);
  torso.position.set(0, 0.75, 0);
  torso.castShadow = true;
  torso.receiveShadow = true;
  group.add(torso);

  // Torso with emissive cracks
  const tosoEmissive = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.63, 0.28), emissiveMat);
  tosoEmissive.position.set(0, 0.75, -0.02);
  tosoEmissive.castShadow = true;
  tosoEmissive.receiveShadow = true;
  group.add(tosoEmissive);

  // Left arm (slightly raised, burn posture)
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.58, 0.14), charMat);
  armL.position.set(-0.3, 1.0, -0.1);
  armL.rotation.z = 0.25; // Raised
  armL.castShadow = true;
  armL.receiveShadow = true;
  group.add(armL);

  // Right arm (slightly raised)
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.58, 0.14), charMat);
  armR.position.set(0.3, 1.0, -0.1);
  armR.rotation.z = -0.25;
  armR.castShadow = true;
  armR.receiveShadow = true;
  group.add(armR);

  // Thighs
  const thighL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.43, 0.18), charMat);
  thighL.position.set(-0.15, 0.22, 0);
  thighL.castShadow = true;
  thighL.receiveShadow = true;
  group.add(thighL);

  const thighR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.43, 0.18), charMat);
  thighR.position.set(0.15, 0.22, 0);
  thighR.castShadow = true;
  thighR.receiveShadow = true;
  group.add(thighR);

  // Shins
  const shinL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.36, 0.16), charMat);
  shinL.position.set(-0.15, -0.12, 0);
  shinL.castShadow = true;
  shinL.receiveShadow = true;
  group.add(shinL);

  const shinR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.36, 0.16), charMat);
  shinR.position.set(0.15, -0.12, 0);
  shinR.castShadow = true;
  shinR.receiveShadow = true;
  group.add(shinR);

  // Feet
  const footL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.28), charMat);
  footL.position.set(-0.15, -0.53, 0.05);
  footL.castShadow = true;
  footL.receiveShadow = true;
  group.add(footL);

  const footR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.28), charMat);
  footR.position.set(0.15, -0.53, 0.05);
  footR.castShadow = true;
  footR.receiveShadow = true;
  group.add(footR);

  // Orange glow light (makes the zombie cast light on surroundings)
  const glowLight = new THREE.PointLight(0xff6633, 0.5, 2.5);
  glowLight.position.set(0, 0.75, 0);
  glowLight.castShadow = false;
  group.add(glowLight);

  scene.add(group);
  return { mesh: group, type: 'charred', hp: 6 };
}

/**
 * Reusable first enemy shell: static PS1-style zombie using an external CC0 texture.
 * Kept intentionally inert so AI/pathing/health systems can be wired in later.
 */
export function createLobbyZombieSentry(
  texturePath = '/assets/textures/enemies/fabric030_color_64.png'
) {
  const entity = createEnemyContainer({
    type: 'zombieSentry',
    hp: 15,
    name: 'ZombieSentry',
  });

  const texture = getEnemyTexture(texturePath);

  const zombieMat = new THREE.MeshStandardMaterial({
    map: texture,
    color: 0x74866d,
    roughness: 0.9,
    metalness: 0,
  });

  const group = entity.mesh;

  // Build and merge all body parts into one mesh so placement is easy to manage.
  const parts = [];
  const temp = new THREE.Object3D();

  function addPart(geometry, x, y, z, rx = 0, ry = 0, rz = 0) {
    temp.position.set(x, y, z);
    temp.rotation.set(rx, ry, rz);
    temp.updateMatrix();
    const g = geometry.clone();
    g.applyMatrix4(temp.matrix);
    parts.push(g);
  }

  addPart(new THREE.BoxGeometry(0.30, 0.34, 0.30), 0, 1.55, 0.02); // head
  addPart(new THREE.BoxGeometry(0.38, 0.10, 0.30), 0, 1.30, 0.03); // collar
  addPart(new THREE.BoxGeometry(0.46, 0.62, 0.34), 0, 0.90, 0.04, 0.06, 0, 0); // torso
  addPart(new THREE.BoxGeometry(0.24, 0.22, 0.10), 0.04, 0.95, -0.18, 0, 0.16, 0); // rib area
  addPart(new THREE.BoxGeometry(0.30, 0.20, 0.10), -0.02, 0.72, -0.18); // abdomen
  addPart(new THREE.BoxGeometry(0.50, 0.24, 0.38), 0, 0.50, 0.03); // coat skirt
  addPart(new THREE.BoxGeometry(0.12, 0.56, 0.14), -0.33, 0.90, -0.04, 0.08, 0, 0.24); // left arm
  addPart(new THREE.BoxGeometry(0.12, 0.56, 0.14), 0.35, 0.86, -0.20, 0.2, 0, -0.48); // right arm
  addPart(new THREE.BoxGeometry(0.12, 0.12, 0.14), 0.44, 0.56, -0.30); // right hand
  addPart(new THREE.BoxGeometry(0.11, 0.11, 0.13), -0.43, 0.64, -0.08); // left hand
  addPart(new THREE.BoxGeometry(0.16, 0.38, 0.18), -0.14, 0.22, 0.01); // left thigh
  addPart(new THREE.BoxGeometry(0.16, 0.38, 0.18), 0.14, 0.22, 0.01); // right thigh
  addPart(new THREE.BoxGeometry(0.14, 0.34, 0.15), -0.14, -0.12, 0.03); // left shin
  addPart(new THREE.BoxGeometry(0.14, 0.34, 0.15), 0.14, -0.12, 0.03); // right shin
  addPart(new THREE.BoxGeometry(0.16, 0.12, 0.25), -0.14, -0.36, 0.08); // left boot
  addPart(new THREE.BoxGeometry(0.16, 0.12, 0.25), 0.14, -0.36, 0.08); // right boot
  addPart(new THREE.BoxGeometry(0.16, 0.10, 0.18), -0.27, 1.12, 0.02, 0, 0, 0.18); // left shoulder
  addPart(new THREE.BoxGeometry(0.16, 0.10, 0.18), 0.27, 1.10, -0.02, 0, 0, -0.22); // right shoulder

  const merged = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  const zombieMesh = new THREE.Mesh(merged, zombieMat);
  group.add(zombieMesh);

  setShadowFlags(group);
  entity.components.visual = {
    style: 'ps1-pixel',
    texturePath,
    // Keep profile metadata stable so future skinned/rigged swaps keep behavior settings.
    rigProfile: {
      skeletonType: 'humanoid-zombie',
      rootBone: 'hips',
      facingAxis: '-z',
    },
  };

  entity.components.animation = {
    state: 'idle',
    states: ['idle', 'walk', 'attack', 'hit', 'death'],
    clips: {},
    mixer: null,
  };

  entity.components.pathing = {
    mode: 'none',
    moveSpeed: 0.75,
    turnSpeed: 2.2,
    homeZone: 'lobby',   // overridden at spawn time
    aggroDepth: 2,        // chase through N connected rooms
    targetPosition: null,
    desiredVelocity: new THREE.Vector3(),
    navigation: {
      probeDistance: 0.65,
      clearancePadding: 0.02,
      minClearanceRatio: 0.12,
      steerAngleStep: 0.35,
      maxSteerAngle: 1.4,
    },
  };

  entity.components.controller = {
    time: 0,
    update(dt) {
      this.time += dt;
      // Tiny idle bob keeps a deterministic per-enemy runtime hook active.
      group.position.y = Math.sin(this.time * 1.25) * 0.01;
    },
  };

  entity.components.health = {
    current: entity.hp,
    max: entity.hp,
    dead: false,
  };

  return entity;
}

/**
 * Spider — small arachnid predator, roughly 1/4 the height of a zombie.
 * Eight spindly legs radiating from a low-slung carapace with a bulbous abdomen.
 * No external textures; procedural canvas detail only.
 * Supports surface-snap locomotion (handled in enemyRuntime).
 */
export function createSpider() {
  const group = new THREE.Group();

  // ── Materials ──────────────────────────────────────────────────────────
  const carapaceMat = new THREE.MeshStandardMaterial({
    map: makeZombieTexture(0x1a1208, (ctx) => {
      // Chitin segmentation lines
      ctx.strokeStyle = '#2d2010';
      ctx.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        const x = Math.random() * 32;
        const y = Math.random() * 32;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (Math.random() - 0.5) * 14, y + (Math.random() - 0.5) * 14);
        ctx.stroke();
      }
      ctx.fillStyle = '#3a2c14';
      for (let i = 0; i < 12; i++) {
        ctx.fillRect(Math.random() * 32, Math.random() * 32, 1, 1);
      }
    }),
    roughness: 0.55,
    metalness: 0.15,
  });

  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0xcc2200,
    emissive: 0xcc2200,
    emissiveIntensity: 0.9,
    roughness: 0.2,
    metalness: 0,
  });

  const legMat = new THREE.MeshStandardMaterial({
    color: 0x120e06,
    roughness: 0.7,
    metalness: 0.1,
  });

  // ── Body ───────────────────────────────────────────────────────────────
  // Cephalothorax (front body) — flat and wide, low to surface
  const cephalo = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.07, 0.16), carapaceMat);
  cephalo.position.set(0, 0.065, 0.05);
  cephalo.castShadow = true;
  cephalo.receiveShadow = true;
  group.add(cephalo);

  // Abdomen (rear bulge)
  const abdomen = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.10, 0.18), carapaceMat);
  abdomen.position.set(0, 0.07, -0.12);
  abdomen.castShadow = true;
  abdomen.receiveShadow = true;
  group.add(abdomen);

  // Neck connector
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.06), carapaceMat);
  neck.position.set(0, 0.055, -0.03);
  neck.castShadow = true;
  neck.receiveShadow = true;
  group.add(neck);

  // ── Eyes (4 front-facing red glowing clusters) ─────────────────────────
  const eyeGeo = new THREE.BoxGeometry(0.025, 0.025, 0.018);
  [
    [-0.055, 0.098, 0.125],
    [-0.025, 0.100, 0.130],
    [ 0.025, 0.100, 0.130],
    [ 0.055, 0.098, 0.125],
  ].forEach(([ex, ey, ez]) => {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(ex, ey, ez);
    group.add(eye);
  });

  // ── Legs (8 total — 4 per side) ────────────────────────────────────────
  const legGeo  = new THREE.BoxGeometry(0.025, 0.12, 0.025);
  const legGeo2 = new THREE.BoxGeometry(0.02,  0.10, 0.02);

  const legDefs = [
    { x:  1, z:  0.08, upperRz: -0.7, upperRx:  0.5 },
    { x: -1, z:  0.08, upperRz:  0.7, upperRx:  0.5 },
    { x:  1, z:  0.02, upperRz: -0.9, upperRx:  0.15 },
    { x: -1, z:  0.02, upperRz:  0.9, upperRx:  0.15 },
    { x:  1, z: -0.04, upperRz: -0.9, upperRx: -0.15 },
    { x: -1, z: -0.04, upperRz:  0.9, upperRx: -0.15 },
    { x:  1, z: -0.10, upperRz: -0.7, upperRx: -0.5 },
    { x: -1, z: -0.10, upperRz:  0.7, upperRx: -0.5 },
  ];

  legDefs.forEach(({ x, z, upperRz, upperRx }) => {
    const upper = new THREE.Mesh(legGeo, legMat);
    upper.position.set(x * 0.13, 0.06, z);
    upper.rotation.set(upperRx, 0, upperRz);
    upper.castShadow = true;
    upper.receiveShadow = true;
    group.add(upper);

    const lower = new THREE.Mesh(legGeo2, legMat);
    lower.position.set(x * 0.21, 0.015, z + upperRx * 0.06);
    lower.rotation.set(upperRx * 0.5, 0, upperRz * 0.4);
    lower.castShadow = true;
    lower.receiveShadow = true;
    group.add(lower);
  });

  setShadowFlags(group, true);

  const entity = createEnemyContainer({
    type: 'spider',
    hp: 14,
    name: 'Spider',
  });
  entity.mesh = group;

  entity.components.visual = {
    style: 'ps1-pixel',
    rigProfile: {
      skeletonType: 'spider',
      rootBone: 'cephalo',
      facingAxis: '+z',
    },
  };

  entity.components.animation = {
    state: 'idle',
    states: ['idle', 'walk', 'attack', 'hit', 'death'],
    clips: {},
    mixer: null,
  };

  entity.components.pathing = {
    mode: 'none',
    moveSpeed: 1.25,
    turnSpeed: 4.0,
    homeZone: 'lobby',
    aggroDepth: 99,
    targetPosition: null,
    desiredVelocity: new THREE.Vector3(),
    navigation: {
      probeDistance: 0.5,
      clearancePadding: 0.04,
      blockedHoldTime: 0.08,
      recoveryDuration: 0.22,
      recoverySpeedScale: 0.85,
      repathBlockedTime: 0.4,
    },
  };

  entity.components.controller = {
    time: 0,
    update(dt) { this.time += dt; },
  };

  entity.components.health = {
    current: entity.hp,
    max: entity.hp,
    dead: false,
  };

  entity.components.spiderCombat = {
    impactArmed: false,
    launchStrength: 0,
    lastImpactDamage: 0,
    lastImpactSpeed: 0,
    lastDamageSource: null,
    lastDamageAt: -Infinity,
    doorHits: Object.create(null),
    lastPlayerHitTime: -Infinity,
  };

  entity.components.knockback = {
    velocity: new THREE.Vector3(),
    active: false,
  };

  // Surface locomotion state — consumed by enemyRuntime for wall/ceiling walking
  // Uses raycast-based adhesion; spider hovers at a small offset above the
  // detected surface and steers along its tangent plane.
  entity.components.surface = {
    normal: new THREE.Vector3(0, 1, 0), // current contact surface normal
    airborne: false,                     // true while shockwave-launched (arc phase)
    airborneTimer: 0,                    // safety timeout accumulator
    _landLockTimer: 0,
    _airTravel: 0,
    _relandGuardTimer: 0,
    _recoverToFloorTimer: 0,
    _launchNormal: new THREE.Vector3(0, 1, 0),
    _launchPos: new THREE.Vector3(),
  };

  return entity;
}
