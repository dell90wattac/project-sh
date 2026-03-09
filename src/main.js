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
import { createShambler, createGuard, createBloat, createCrawler, createCharred } from './entities/zombies.js';
import { createWorldItems } from './systems/worldItems.js';

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
scene.background = new THREE.Color(0x111014);
scene.fog = new THREE.FogExp2(0x111014, 0.025);

// ─── Camera ────────────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 100);

// ─── Physics ────────────────────────────────────────────────────────────────
const physicsWorld = createPhysicsWorld();

// ─── World ──────────────────────────────────────────────────────────────────
const world = createWorld(scene, physicsWorld);

// ─── Inventory & Gun ───────────────────────────────────────────────────────
const inventory = createInventory();
inventory.addItem('ammo', 100);
inventory.addItem('healingB', 1);
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

// Place a Healing Herb on the front desk for testing
worldItems.spawnPickup('healingA', 1, new THREE.Vector3(2, 1.6, -10));

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
function createChandelier(x, y, z) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.3), new THREE.MeshLambertMaterial({ color: 0x888888 }));
  base.position.set(0, 0, 0);
  group.add(base);
  for (let i = 0; i < 6; i++) {
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5), new THREE.MeshLambertMaterial({ color: 0x333333 }));
    chain.position.set(Math.cos(i * Math.PI / 3) * 0.6, -0.75, Math.sin(i * Math.PI / 3) * 0.6);
    group.add(chain);
  }
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2), new THREE.MeshBasicMaterial({ color: 0xffffff, emissive: 0x444444 }));
  bulb.position.set(0, -1.5, 0);
  group.add(bulb);
  const light = new THREE.PointLight(0xffffff, 5, 30);
  light.position.set(0, -1.5, 0);
  group.add(light);
  group.position.set(x, y, z);
  return group;
}

scene.add(createChandelier(0, 13, 0));
scene.add(createChandelier(-10, 13, -10));
scene.add(createChandelier(10, 13, 10));
scene.add(createChandelier(0, 13, -20));

// ─── Zombie Showcase ───────────────────────────────────────────────────────
// Spawn one of each zombie type in a row so the player can walk around and inspect them.
function spawnZombies() {
  const zombieSpawns = [
    { factory: createShambler, x: -8, z: 5 },
    { factory: createGuard, x: -4, z: 5 },
    { factory: createBloat, x: 0, z: 5 },
    { factory: createCrawler, x: 4, z: 5 },
    { factory: createCharred, x: 8, z: 5 },
  ];

  for (const spawn of zombieSpawns) {
    const zombie = spawn.factory(scene);
    zombie.mesh.position.set(spawn.x, 0, spawn.z);
  }
}

spawnZombies();

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

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);

  const dead = playerHealth.isDead();

  if (!dead) gun.update(dt);

  const gunState = gun.getAmmoState();

  stepPhysics(physicsWorld, dt);

  if (!dead) {
    player.update(dt, gunState);
    worldItems.update(dt);
  }

  // Freeze camera rotation while inventory open
  if (inventoryUI.isOpen() && savedCameraQuaternion) {
    camera.quaternion.copy(savedCameraQuaternion);
  }

  // ─── Input ──────────────────────────────────────────────────────────────
  if (!dead) {
    // E key: pickup if hovering item, otherwise toggle inventory
    const eKeyPressed = player.keys['KeyE'];
    if (eKeyPressed && !lastEKeyState) {
      if (inventoryUI.isOpen()) {
        inventoryUI.toggle();
      } else if (worldItems.getHovered()) {
        worldItems.tryPickup();
      } else {
        inventoryUI.toggle();
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

  renderer.render(scene, camera);
}

loop();

// ─── Resize ────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
