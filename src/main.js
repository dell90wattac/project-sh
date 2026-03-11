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
import { makeKeyItemId } from './systems/itemRegistry.js';
import { createLock } from './systems/lock.js';
import { createFog } from './systems/fog.js';
import { createDoorSystem } from './systems/door.js';
import { createRoomCulling } from './systems/roomCulling.js';
import { createPerfOverlay } from './ui/perfOverlay.js';
import { createChandelierMotionSystem } from './systems/chandelierMotion.js';
import { createEnemyRuntime } from './systems/enemyRuntime.js';

// ─── Renderer ──────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
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
const worldItems = createWorldItems(scene, camera, inventory, {
  resolveRoomId(position) {
    return world.getRoomAtPosition ? world.getRoomAtPosition(position, 0.2) : 'lobby';
  },
});

const actionLabel = document.createElement('div');
actionLabel.style.cssText = `
  position: fixed;
  top: 44%;
  left: 50%;
  transform: translateX(-50%);
  color: #9be5ff;
  font-family: monospace;
  font-size: 14px;
  font-weight: bold;
  text-align: center;
  pointer-events: none;
  z-index: 120;
  letter-spacing: 0.08em;
  text-shadow: 0 0 8px rgba(0, 0, 0, 0.9), 0 0 2px rgba(0, 0, 0, 1);
  display: none;
`;
const uiRoot = document.getElementById('ui-root') || document.body;
uiRoot.appendChild(actionLabel);
let actionLabelTimer = 0;

function showActionLabel(text, duration = 1.4) {
  actionLabel.textContent = text;
  actionLabel.style.display = 'block';
  actionLabelTimer = duration;
}

// Three full stacks of handgun ammo (27 each) in front of desk
worldItems.spawnPickup('ammo', 27, new THREE.Vector3(-1.5, 0.3, 1.5));
worldItems.spawnPickup('ammo', 27, new THREE.Vector3(0, 0.3, 1.5));
worldItems.spawnPickup('ammo', 27, new THREE.Vector3(1.5, 0.3, 1.5));

const lobbyEastDoorKeyId = 'doorLobbyEast';
const lobbyEastDoorKeyItemType = makeKeyItemId(lobbyEastDoorKeyId);
if (lobbyEastDoorKeyItemType) {
  worldItems.spawnPickup(lobbyEastDoorKeyItemType, 1, new THREE.Vector3(2.25, 0.3, 1.5));
}

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
const enemyRuntime = createEnemyRuntime(world, player);
const worldDoors = Array.isArray(world.doors) && world.doors.length > 0
  ? world.doors
  : (world.door ? [{ id: 'doorPrimary', roomIds: ['lobby'], door: world.door }] : []);

const locksByDoorId = new Map();
const doorSystemById = new Map();
const lobbyEastDoorRef = worldDoors.find(doorRef => doorRef.id === 'doorLobbyEast');
if (lobbyEastDoorRef) {
  const lockPosition = new THREE.Vector3();
  lobbyEastDoorRef.door.pivot.updateWorldMatrix(true, false);
  lobbyEastDoorRef.door.pivot.getWorldPosition(lockPosition);
  lockPosition.y = 1.0;
  lockPosition.z += lobbyEastDoorRef.door.width * 0.75;

  const lobbyEastLock = createLock({
    id: 'lockDoorLobbyEast',
    requiredKeyId: lobbyEastDoorKeyId,
    position: lockPosition,
    unlockRadius: 1.5,
    verticalTolerance: 1.8,
    onUnlock() {
      const doorSystem = doorSystemById.get('doorLobbyEast');
      if (doorSystem && doorSystem.setInteractionEnabled) {
        doorSystem.setInteractionEnabled(true);
      }
      showActionLabel('UNLOCKED: LOBBY EAST DOOR');
    },
  });

  locksByDoorId.set(lobbyEastDoorRef.id, lobbyEastLock);
}

const doorSystems = worldDoors.map(doorRef => ({
  ...doorRef,
  lock: locksByDoorId.get(doorRef.id) || null,
  system: createDoorSystem(doorRef.door, player, camera, {
    lock: locksByDoorId.get(doorRef.id) || null,
    interactionEnabled: !locksByDoorId.has(doorRef.id),
    getHeldItemType: () => {
      const equipped = inventory.getEquipped();
      return equipped ? equipped.itemType : null;
    },
  }),
}));

for (const doorEntry of doorSystems) {
  doorSystemById.set(doorEntry.id, doorEntry.system);
}

function getBestDoorInteraction() {
  if (doorSystems.length === 0) return null;

  let best = null;
  for (const doorEntry of doorSystems) {
    const interaction = doorEntry.system.getInteraction();
    if (!best || interaction.doorBlend > best.doorBlend) {
      best = interaction;
    }
  }
  return best;
}

function autoEquipNearbyLockKey() {
  const playerPos = player.getPosition ? player.getPosition() : null;
  if (!playerPos) return;

  const equipped = inventory.getEquipped ? inventory.getEquipped() : null;
  const equippedType = equipped ? equipped.itemType : null;

  for (const doorEntry of doorSystems) {
    const lock = doorEntry.lock;
    if (!lock || !lock.isLocked || !lock.isLocked()) continue;

    const requiredItemType = lock.requiredItemType;
    if (!requiredItemType) continue;
    if (equippedType === requiredItemType) return;

    if (inventory.getItemCount(requiredItemType) <= 0) continue;

    if (typeof lock.isActorInRange === 'function' && !lock.isActorInRange(playerPos)) {
      continue;
    }

    const keySlot = inventory.getItems().find(item => item.itemType === requiredItemType);
    if (!keySlot) continue;

    const equippedNow = inventory.equipItem(keySlot.slotIndex);
    if (equippedNow) {
      showActionLabel('KEY IN HAND');
    }
    return;
  }
}

const roomCulling = createRoomCulling(world, player, worldItems, {
  boundaryPadding: 0.2,
});

function getWorldRoomCount() {
  if (!world.getRoomIds) return 0;
  const roomIds = world.getRoomIds();
  return Array.isArray(roomIds) && roomIds.length > 0
    ? roomIds.length
    : 0;
}

// ─── HUD ───────────────────────────────────────────────────────────────────
const hud = createHUD(gun, playerHealth);
const perfOverlay = createPerfOverlay();

// ─── Camera state for inventory ────────────────────────────────────────────
let savedCameraQuaternion = null;

inventoryUI.setToggleCallback((isOpen) => {
  if (isOpen) {
    savedCameraQuaternion = camera.quaternion.clone();
  } else {
    savedCameraQuaternion = null;
  }

  if (player.refreshCursorMode) {
    player.refreshCursorMode();
  }
});

// ─── Chandeliers ───────────────────────────────────────────────────────────
// Sized for 5.5 m ceiling — bottom bulb at ~3.6 m, clearly visible.
const lobbyChandeliers = [];

function createChandelier(x, y, z, seed) {
  const group = new THREE.Group();
  const chains = [];
  const arms = [];
  const bulbs = [];
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
    chains.push(chain);
    group.add(chain);
  }
  // Inner ring of 6 arms
  for (let i = 0; i < 6; i++) {
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.55),
      new THREE.MeshStandardMaterial({ color: 0x5A4A30, roughness: 0.4, metalness: 0.7 })
    );
    arm.position.set(Math.cos(i * Math.PI / 3) * 0.30, -1.1, Math.sin(i * Math.PI / 3) * 0.30);
    arms.push(arm);
    group.add(arm);
    // Candle-bulb at each arm tip
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xFFF8E0 })
    );
    bulb.position.set(Math.cos(i * Math.PI / 3) * 0.30, -1.45, Math.sin(i * Math.PI / 3) * 0.30);
    bulbs.push(bulb);
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
  return { group, chains, arms, bulbs, mainBulb, light, seed };
}

// Hang chandeliers along center axis — entry, desk, transition
function addLobbyChandelier(x, y, z, seed) {
  const chandelier = createChandelier(x, y, z, seed);
  scene.add(chandelier.group);
  lobbyChandeliers.push(chandelier);
  if (world.registerExternalRoomObject) {
    world.registerExternalRoomObject('lobby', chandelier.group);
  }
}

addLobbyChandelier(0, 5.1, 0, 1);
addLobbyChandelier(0, 5.1, 6, 2);
addLobbyChandelier(0, 5.1, -4, 3);

const chandelierMotion = createChandelierMotionSystem(lobbyChandeliers);

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
const overlayTitle = overlay ? overlay.querySelector('h1') : null;
const overlaySubtitle = overlay ? overlay.querySelector('p') : null;

let isStartupLoading = true;
let canStartGameplay = false;
let loadingElapsed = 0;

if (overlay) {
  overlay.style.display = 'flex';
  overlay.style.opacity = '1';
  overlay.style.cursor = 'wait';
  overlay.style.pointerEvents = 'none';
}

function setOverlayText(title, subtitle) {
  if (overlayTitle) overlayTitle.textContent = title;
  if (overlaySubtitle) overlaySubtitle.textContent = subtitle;
}

function beginGameplay() {
  if (!canStartGameplay || !overlay) return;

  isStartupLoading = false;

  try {
    player.lock();
    setTimeout(() => {
      if (!player.controls.isLocked && !player.hasEverPointerLock()) {
        player.enableFallback();
      }
    }, 700);
  } catch {
    player.enableFallback();
  }

  overlay.style.opacity = '0';
  setTimeout(() => {
    overlay.style.display = 'none';
  }, 1000);
}

if (overlay) {
  overlay.addEventListener('click', beginGameplay);
}

setOverlayText('Loading', 'preparing...');

function updateStartupLoading(dt) {
  loadingElapsed += dt;

  const progressPct = Math.round(Math.min(1, loadingElapsed / 0.9) * 100);
  setOverlayText('Loading', `preparing ${progressPct}%`);

  if (loadingElapsed < 0.9) return;

  canStartGameplay = true;

  if (overlay) {
    overlay.style.cursor = 'pointer';
    overlay.style.pointerEvents = 'all';
  }
  setOverlayText('Project SH', 'click to begin');
}

// ─── Clock & Loop ──────────────────────────────────────────────────────────
const clock = new THREE.Clock();

const shadowCameraPosRef = new THREE.Vector3();
const shadowCameraQuatRef = new THREE.Quaternion();
let shadowRefInitialized = false;
let shadowUpdateCooldown = 0;
let lastFlashlightShadowEnabled = false;
let muzzleShadowBurstTimer = 0;

function updateFlashlightShadowRefresh(dt, flashlightEnabled) {
  const shadowEnabled = !!flashlightEnabled;
  const toggled = shadowEnabled !== lastFlashlightShadowEnabled;
  const interval = shadowEnabled ? (1 / 24) : 0;

  if (!shadowRefInitialized) {
    shadowCameraPosRef.copy(camera.position);
    shadowCameraQuatRef.copy(camera.quaternion);
    shadowRefInitialized = true;
  }

  const moved = camera.position.distanceToSquared(shadowCameraPosRef) > 0.0004;
  const rotationDelta = 1 - Math.abs(camera.quaternion.dot(shadowCameraQuatRef));
  const rotated = rotationDelta > 0.00002;

  shadowUpdateCooldown -= dt;
  const refreshByMotion = shadowEnabled && (moved || rotated) && shadowUpdateCooldown <= 0;
  const refreshByToggle = toggled;

  if (refreshByMotion || refreshByToggle) {
    renderer.shadowMap.needsUpdate = true;
    shadowUpdateCooldown = interval;
  }

  if (moved || rotated) {
    shadowCameraPosRef.copy(camera.position);
    shadowCameraQuatRef.copy(camera.quaternion);
  }

  lastFlashlightShadowEnabled = shadowEnabled;
}

let lastEKeyState = false;

window.addEventListener('keydown', e => {
  if (e.code !== 'KeyQ' || e.repeat) return;
  if (isStartupLoading || playerHealth.isDead()) return;

  inventoryUI.toggle();

  // Closing inventory from this keydown is a user gesture, so attempt immediate relock.
  if (!inventoryUI.isOpen() && !player.controls.isLocked) {
    try {
      player.lock();
    } catch {
      // Some browsers may still deny; click-to-relock fallback remains active.
    }
  }
});

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (actionLabelTimer > 0) {
    actionLabelTimer -= dt;
    if (actionLabelTimer <= 0) {
      actionLabel.style.display = 'none';
      actionLabelTimer = 0;
    }
  }

  if (isStartupLoading) {
    updateFlashlightShadowRefresh(dt, false);
    updateStartupLoading(dt);
    chandelierMotion.update(dt);
    fog.update(dt);
    renderer.render(scene, camera);

    const startupStats = roomCulling.getStats();
    perfOverlay.update(dt, {
      currentRoomId: startupStats.currentRoomId,
      currentRoomLabel: startupStats.currentRoomLabel,
      currentZone: startupStats.currentZone,
      visibleRooms: startupStats.visibleRooms,
      totalRooms: startupStats.totalRooms,
      pendingVisibilityChanges: startupStats.pendingVisibilityChanges,
      meshOpsPerFrame: startupStats.meshOpsPerFrame,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    });
    return;
  }

  const dead = playerHealth.isDead();

  if (!dead) gun.update(dt);

  const gunState = gun.getAmmoState();
  if (gunState.isFiring) {
    muzzleShadowBurstTimer = 0.18;
  } else if (muzzleShadowBurstTimer > 0) {
    muzzleShadowBurstTimer = Math.max(0, muzzleShadowBurstTimer - dt);
  }

  stepPhysics(physicsWorld, dt);

  if (!dead) {
    autoEquipNearbyLockKey();
    for (const doorEntry of doorSystems) {
      doorEntry.system.update(dt);
    }
    const doorInteraction = getBestDoorInteraction();
    player.update(dt, gunState, doorInteraction);
    for (const doorEntry of doorSystems) {
      doorEntry.system.applyPlayerPushback(player);
    }
    enemyRuntime.update(dt);
    worldItems.update(dt);
  }

  roomCulling.update();

  // Freeze camera rotation while inventory open
  if (inventoryUI.isOpen() && savedCameraQuaternion) {
    camera.quaternion.copy(savedCameraQuaternion);
  }

  // ─── Input ──────────────────────────────────────────────────────────────
  if (!dead) {
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
  chandelierMotion.update(dt);

  inventoryUI.update(dt);
  hud.update(dt);
  damageEffects.update(dt);
  fog.update(dt);

  const flashlightShadowsActive = !dead
    && player.getFlashlightOn
    && player.getFlashlightOn()
    && !inventoryUI.isOpen();
  const muzzleShadowsActive = !dead && muzzleShadowBurstTimer > 0 && !inventoryUI.isOpen();
  updateFlashlightShadowRefresh(dt, flashlightShadowsActive || muzzleShadowsActive);

  renderer.render(scene, camera);

  const roomStats = roomCulling.getStats();
  perfOverlay.update(dt, {
    currentRoomId: roomStats.currentRoomId,
    currentRoomLabel: roomStats.currentRoomLabel,
    currentZone: roomStats.currentZone,
    visibleRooms: roomStats.visibleRooms,
    totalRooms: roomStats.totalRooms,
    pendingVisibilityChanges: roomStats.pendingVisibilityChanges,
      meshOpsPerFrame: roomStats.meshOpsPerFrame,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
  });
}

loop();

// ─── Resize ────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
