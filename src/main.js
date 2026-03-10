import * as THREE from 'three';
import { createWorld } from './world/world.js';
import { createPlayer } from './player/player.js';
import { createPhysicsWorld, stepPhysics } from './systems/physics.js';
import { createInventory } from './systems/inventory.js';
import { createInventoryUI } from './ui/inventory.js';
import { createGun } from './systems/weapons.js';
import { createHUD } from './ui/hud.js';
import { createHealth } from './systems/health.js';
import { createDamageEffects } from './ui/damageEffects.js';
import { createWorldItems } from './systems/worldItems.js';
import { createFog } from './systems/fog.js';
import { createDoorSystem } from './systems/door.js';

// ─── Renderer ──────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.insertBefore(renderer.domElement, document.getElementById('ui-root'));

// ─── Scene ─────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1A1510);
scene.fog = new THREE.FogExp2(0x1A1510, 0.12);

// ─── Camera ────────────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 100);

// ─── Physics ────────────────────────────────────────────────────────────────
const physicsWorld = createPhysicsWorld();

// ─── World ──────────────────────────────────────────────────────────────────
const world = createWorld(scene, physicsWorld);
const fog = createFog(scene);

// ─── Inventory & Gun ───────────────────────────────────────────────────────
const inventory = createInventory();
inventory.setEquippedDirect('handgun', 1);
const gun = createGun(inventory, physicsWorld, camera);

// ─── Health System ─────────────────────────────────────────────────────────
const playerHealth = createHealth(10);

// ─── Damage Effects ────────────────────────────────────────────────────────
const damageEffects = createDamageEffects(playerHealth);

playerHealth.onDamage((amount, currentHP) => {
  damageEffects.flashDamage();
});

playerHealth.onDeath(() => {
  damageEffects.triggerDeath();
});

damageEffects.onReset(() => {
  resetGame();
});

// ─── World Items / Pickups ─────────────────────────────────────────────────
const worldItems = createWorldItems(scene, camera, inventory);

// Three full stacks of handgun ammo (27 each) in front of desk
worldItems.spawnPickup('ammo', 27, new THREE.Vector3(-1.5, 0.3, 1.5));
worldItems.spawnPickup('ammo', 27, new THREE.Vector3(0, 0.3, 1.5));
worldItems.spawnPickup('ammo', 27, new THREE.Vector3(1.5, 0.3, 1.5));

// Healing items behind the desk
worldItems.spawnPickup('healingA', 1, new THREE.Vector3(-1, 0.3, -1.0));
worldItems.spawnPickup('healingB', 1, new THREE.Vector3(1, 0.3, -1.0));

// ─── Inventory UI (needs health + drop callback) ──────────────────────────
const inventoryUI = createInventoryUI(inventory, playerHealth, {
  onDrop(itemType, quantity) {
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    dir.y = 0;
    dir.normalize();
    worldItems.spawnDrop(itemType, quantity, player.getPosition(), dir);
  },
});

// ─── Player ────────────────────────────────────────────────────────────────
const player = createPlayer(camera, scene, world, physicsWorld, inventoryUI, playerHealth);
const doorSystem = world.door ? createDoorSystem(world.door, player, camera) : null;

// ─── HUD ───────────────────────────────────────────────────────────────────
const hud = createHUD(gun, playerHealth);

// ─── Camera state for inventory ────────────────────────────────────────────
let savedCameraQuaternion = null;

inventoryUI.setToggleCallback((isOpen) => {
  if (isOpen) {
    savedCameraQuaternion = camera.quaternion.clone();
  } else {
    savedCameraQuaternion = null;
  }
});

// ─── Chandeliers ───────────────────────────────────────────────────────────
// Sized for 5.5 m ceiling — bottom bulb at ~3.6 m, clearly visible.
function createChandelier(x, y, z) {
  const group = new THREE.Group();
  // Main crown disc
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.5, 0.20),
    new THREE.MeshStandardMaterial({ color: 0x6A6050, roughness: 0.5, metalness: 0.6 })
  );
  group.add(base);
  // Outer ring of 8 short chains
  for (let i = 0; i < 8; i++) {
    const chain = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 1.0),
      new THREE.MeshStandardMaterial({ color: 0x2A2418, roughness: 0.4, metalness: 0.8 })
    );
    chain.position.set(Math.cos(i * Math.PI / 4) * 0.52, -0.5, Math.sin(i * Math.PI / 4) * 0.52);
    group.add(chain);
  }
  // Inner ring of 6 arms
  for (let i = 0; i < 6; i++) {
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.55),
      new THREE.MeshStandardMaterial({ color: 0x5A4A30, roughness: 0.4, metalness: 0.7 })
    );
    arm.position.set(Math.cos(i * Math.PI / 3) * 0.30, -1.1, Math.sin(i * Math.PI / 3) * 0.30);
    group.add(arm);
    // Candle-bulb at each arm tip
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xFFF8E0 })
    );
    bulb.position.set(Math.cos(i * Math.PI / 3) * 0.30, -1.45, Math.sin(i * Math.PI / 3) * 0.30);
    group.add(bulb);
  }
  // Central hanging bulb
  const mainBulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xFFFBF0 })
  );
  mainBulb.position.set(0, -1.5, 0);
  group.add(mainBulb);
  // Light source
  const light = new THREE.PointLight(0xFFEFCC, 4.5, 16);
  light.position.set(0, -1.5, 0);
  group.add(light);
  group.position.set(x, y, z);
  return group;
}

// Hang chandeliers along center axis — entry, desk, transition
scene.add(createChandelier( 0, 5.1,  0));
scene.add(createChandelier( 0, 5.1,  6));
scene.add(createChandelier( 0, 5.1, -4));

// ─── Hazard Tick Damage ────────────────────────────────────────────────────
const hazardTimers = {};

function updateHazards(dt) {
  if (playerHealth.isDead()) return;

  const playerPos = player.getPosition();

  for (const hazard of world.hazards) {
    const dx = playerPos.x - hazard.position.x;
    const dz = playerPos.z - hazard.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    const id = hazard.type;

    if (dist <= hazard.radius) {
      if (!hazardTimers[id]) hazardTimers[id] = 0;
      hazardTimers[id] += dt;

      if (hazardTimers[id] >= 1.0) {
        hazardTimers[id] -= 1.0;
        playerHealth.takeDamage(hazard.damagePerSecond, hazard.damageType);
      }
    } else {
      hazardTimers[id] = 0;
    }
  }
}

// ─── Game Reset ────────────────────────────────────────────────────────────
function resetGame() {
  playerHealth.reset();
  damageEffects.reset();
  player.resetPosition();
  for (const key in hazardTimers) hazardTimers[key] = 0;
}

// ─── Start overlay ─────────────────────────────────────────────────────────
const overlay = document.getElementById('overlay');
overlay.addEventListener('click', () => {
  try {
    player.lock();
    setTimeout(() => {
      if (!document.pointerLockElement) {
        player.enableFallback();
      }
    }, 200);
  } catch {
    player.enableFallback();
  }
  overlay.style.opacity = '0';
  setTimeout(() => overlay.style.display = 'none', 1000);
});

// ─── Clock & Loop ──────────────────────────────────────────────────────────
const clock = new THREE.Clock();

let lastEKeyState = false;
let lastQKeyState = false;

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);

  const dead = playerHealth.isDead();

  if (!dead) gun.update(dt);

  const gunState = gun.getAmmoState();

  stepPhysics(physicsWorld, dt);

  if (!dead) {
    if (doorSystem) doorSystem.update(dt);
    const doorInteraction = doorSystem ? doorSystem.getInteraction() : null;
    player.update(dt, gunState, doorInteraction);
    if (doorSystem) doorSystem.applyPlayerPushback(player);
    worldItems.update(dt);
  }

  // Freeze camera rotation while inventory open
  if (inventoryUI.isOpen() && savedCameraQuaternion) {
    camera.quaternion.copy(savedCameraQuaternion);
  }

  // ─── Input ──────────────────────────────────────────────────────────────
  if (!dead) {
    // Q key: toggle inventory
    const qKeyPressed = player.keys['KeyQ'];
    if (qKeyPressed && !lastQKeyState) {
      inventoryUI.toggle();
    }
    lastQKeyState = qKeyPressed;

    // E key: pickup item
    const eKeyPressed = player.keys['KeyE'];
    if (eKeyPressed && !lastEKeyState) {
      if (!inventoryUI.isOpen() && worldItems.getHovered()) {
        worldItems.tryPickup();
      }
    }
    lastEKeyState = eKeyPressed;

    // Gun reload (R key)
    if (player.keys['KeyR'] && !inventoryUI.isOpen()) {
      gun.reload();
    }

    // Gun fire (left-click)
    if (player.keys['MouseLeft'] && !inventoryUI.isOpen()) {
      gun.fire();
    }
  }

  // ─── Hazard tick damage ─────────────────────────────────────────────────
  updateHazards(dt);

  inventoryUI.update(dt);
  hud.update(dt);
  damageEffects.update(dt);
  fog.update(dt);

  renderer.render(scene, camera);
}

loop();

// ─── Resize ────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
