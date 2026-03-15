import * as THREE from 'three';
import { createWorld } from './world/world.js';
import { createPlayer } from './player/player.js';
import { createPhysicsWorld, stepPhysics } from './systems/physics.js';
import { createInventory } from './systems/inventory.js';
import { createInventoryUI } from './ui/inventory.js';
import { createDebugMenuUI } from './ui/debugMenu.js';
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
import { createEnemyAI } from './systems/enemyAI.js';
import { attachEnemyComponents } from './entities/zombies.js';
import { createShockwaveSystem } from './systems/shockwave.js';
import { createShockwaveFx } from './systems/shockwaveFx.js';
import { getAmmoConfigForItem } from './systems/ammoTypes.js';
import { createGunshotAudio } from './systems/gunshotAudio.js';
import { createItemClackAudio } from './systems/itemClackAudio.js';
import { createSpawnTriggers } from './systems/spawnTriggers.js';

const BUILD_VERSION = '22.7';
const AUDIO_DEBUG = (() => {
  try {
    if (typeof window === 'undefined') return false;
    const enabledByQuery = new URLSearchParams(window.location.search).get('audioDebug') === '1';
    const enabledByGlobal = window.__AUDIO_DEBUG__ === true;
    const enabled = enabledByQuery || enabledByGlobal;
    window.__AUDIO_DEBUG__ = enabled;
    return enabled;
  } catch {
    return false;
  }
})();

const SPIDER_DEBUG = (() => {
  try {
    if (typeof window === 'undefined') return false;
    const enabledByQuery = new URLSearchParams(window.location.search).get('spiderDebug') === '1';
    const enabledByGlobal = window.__SPIDER_DEBUG__ === true;
    const enabled = enabledByQuery || enabledByGlobal;
    window.__SPIDER_DEBUG__ = enabled;
    return enabled;
  } catch {
    return false;
  }
})();

function _dbgNum(n) {
  return Number.isFinite(n) ? Number(n.toFixed(3)) : n;
}

function _dbgVec3(v) {
  if (!v) return null;
  return { x: _dbgNum(v.x), y: _dbgNum(v.y), z: _dbgNum(v.z) };
}

if (SPIDER_DEBUG) {
  console.log('[SpiderDBG] enabled (?spiderDebug=1)');
}

// ─── Loading Progress ──────────────────────────────────────────────────────
const _loadBarFill = document.getElementById('loading-bar-fill');
const _loadStatus  = document.getElementById('loading-status');

function setLoadProgress(pct, status) {
  if (_loadBarFill) _loadBarFill.style.width = pct + '%';
  if (_loadStatus)  _loadStatus.textContent = status;
}

function yieldToUI(pct, status) {
  setLoadProgress(pct, status);
  return new Promise(resolve => requestAnimationFrame(resolve));
}

setLoadProgress(0, 'initializing');

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

await yieldToUI(5, 'creating scene');

// ─── Scene ─────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1A1510);
scene.fog = new THREE.FogExp2(0x1A1510, 0.12);

// ─── Camera ────────────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 100);

// ─── Physics ────────────────────────────────────────────────────────────────
const physicsWorld = createPhysicsWorld();

await yieldToUI(10, 'building world');

// ─── World ──────────────────────────────────────────────────────────────────
const world = createWorld(scene, physicsWorld);
const fog = createFog(scene);

await yieldToUI(40, 'baking shadows');

// ─── Static Shadow Bake ─────────────────────────────────────────────────────
// Architectural lights (sconces, wall washers) are static — trigger one shadow
// render pass so wainscoting/trim shadows are baked at no per-frame cost.
// The flashlight system (updateFlashlightShadowRefresh) handles dynamic updates.
renderer.shadowMap.needsUpdate = true;

await yieldToUI(45, 'loading systems');

// ─── Inventory & Gun ───────────────────────────────────────────────────────
const inventory = createInventory();
inventory.setEquippedDirect('handgun', 1);
// Player starts with gun but no ammo — must find regular ammo in the lobby.
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
  location.reload();
});

await yieldToUI(55, 'placing items');

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

// ─── Lobby Items (starting supplies — regular ammo only) ────────────────
worldItems.spawnPickup('ammo', 18, new THREE.Vector3(-1.5, 0.3, 1.5));
worldItems.spawnPickup('ammo', 9, new THREE.Vector3(1.5, 0.3, 1.5));

// ─── West Wing Key (optional detour) — unusual spot near the damage pillar ──
const lobbyEastDoorKeyId = 'doorLobbyEast';
const lobbyEastDoorKeyItemType = makeKeyItemId(lobbyEastDoorKeyId);
if (lobbyEastDoorKeyItemType) {
  worldItems.spawnPickup(lobbyEastDoorKeyItemType, 1, new THREE.Vector3(0.3, 0.3, -3.5));
}

// ─── East Wing: Reception Office (unlocked, first room explored) ────────
const adminKeyItemType = makeKeyItemId('doorHallAdmin');
if (adminKeyItemType) {
  worldItems.spawnPickup(adminKeyItemType, 1, new THREE.Vector3(10.0, 0.3, 6.0));
}
worldItems.spawnPickup('ammo', 18, new THREE.Vector3(8.5, 0.3, 6.5));
worldItems.spawnPickup('healingA', 1, new THREE.Vector3(11.5, 0.3, 5.5));

// ─── East Wing: Manager's Office (unlocked) ─────────────────────────────
worldItems.spawnPickup('ammo', 9, new THREE.Vector3(10.0, 0.3, -1.5));
worldItems.spawnPickup('healingA', 1, new THREE.Vector3(8.5, 0.3, -1.0));

// ─── East Wing: Admin Office (locked — contains Director's Key) ─────────
const directorKeyItemType = makeKeyItemId('doorHallDirector');
if (directorKeyItemType) {
  worldItems.spawnPickup(directorKeyItemType, 1, new THREE.Vector3(16.0, 0.3, 6.0));
}
worldItems.spawnPickup('ammo', 18, new THREE.Vector3(14.5, 0.3, 6.5));
worldItems.spawnPickup('healingB', 1, new THREE.Vector3(17.5, 0.3, 5.5));

// ─── East Wing: Kitchen (unlocked — healing station) ────────────────────
worldItems.spawnPickup('healingB', 1, new THREE.Vector3(16.0, 0.3, -1.5));
worldItems.spawnPickup('healingA', 1, new THREE.Vector3(14.5, 0.3, -1.0));

// ─── East Wing: Director's Office (locked — THE payoff room) ───────────
const escapeKeyItemType = makeKeyItemId('escape');
if (escapeKeyItemType) {
  worldItems.spawnPickup(escapeKeyItemType, 1, new THREE.Vector3(21.8, 0.3, 2.5));
}
worldItems.spawnPickup('ammoHeavy', 27, new THREE.Vector3(21.0, 0.3, 4.0));
worldItems.spawnPickup('ammoHeavy', 27, new THREE.Vector3(22.5, 0.3, 1.0));
worldItems.spawnPickup('healingC', 1, new THREE.Vector3(23.0, 0.3, 3.5));

// ─── West Wing Offshoot Rooms (optional detour) ────────────────────────
worldItems.spawnPickup('ammo', 9, new THREE.Vector3(-9.2, 0.3, 2.5));
worldItems.spawnPickup('healingB', 1, new THREE.Vector3(-13.2, 0.3, 2.5));
worldItems.spawnPickup('ammo', 9, new THREE.Vector3(-17.2, 0.3, 2.3));
worldItems.spawnPickup('healingA', 1, new THREE.Vector3(-17.2, 0.3, 2.8));

await yieldToUI(65, 'creating player');

// ─── Inventory UI (needs health + drop callback) ──────────────────────────
const inventoryUI = createInventoryUI(inventory, playerHealth, {
  onDrop(itemType, quantity) {
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    dir.y = 0;
    dir.normalize();
    worldItems.spawnDrop(itemType, quantity, player.getPosition(), dir);
  },
  onCombineWithGun(ammoItemType) {
    const result = gun.combineAmmoType(ammoItemType);
    if (result && result.success) {
      return { success: true };
    }

    if (result && result.reason === 'no-space-for-ejected-rounds') {
      return { success: false, message: 'NO INVENTORY SPACE' };
    }
    if (result && result.reason === 'reloading') {
      return { success: false, message: 'BUSY RELOADING' };
    }

    return { success: false, message: 'CANNOT COMBINE' };
  },
});

// ─── Player ────────────────────────────────────────────────────────────────
const debugMenuUI = createDebugMenuUI({
  getNoclipEnabled: () => false,
  setNoclipEnabled: () => {},
  getInvincibleEnabled: () => !!(playerHealth.isInvincible && playerHealth.isInvincible()),
  setInvincibleEnabled: (enabled) => {
    if (playerHealth.setInvincible) playerHealth.setInvincible(!!enabled);
  },
});

const player = createPlayer(camera, scene, world, physicsWorld, inventoryUI, playerHealth, debugMenuUI);
debugMenuUI.setBindings({
  getNoclipEnabled: () => !!(player.isNoclipEnabled && player.isNoclipEnabled()),
  setNoclipEnabled: (enabled) => {
    if (player.setNoclipEnabled) player.setNoclipEnabled(!!enabled);
  },
  getLeaveHitboxEnabled: () => !!(player.isEnemyTargetLocked && player.isEnemyTargetLocked()),
  setLeaveHitboxEnabled: (enabled) => {
    if (player.setEnemyTargetLocked) player.setEnemyTargetLocked(!!enabled);
  },
});
const enemyRuntime = createEnemyRuntime(world, player, { playerHealth });
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
    onUnlock({ requiredItemType }) {
      const doorSystem = doorSystemById.get('doorLobbyEast');
      if (doorSystem && doorSystem.setInteractionEnabled) {
        doorSystem.setInteractionEnabled(true);
      }
      showActionLabel('UNLOCKED: LOBBY EAST DOOR');
    },
  });

  locksByDoorId.set(lobbyEastDoorRef.id, lobbyEastLock);
}

// ─── Admin Office Lock ─────────────────────────────────────────────────────
function createDoorLock(doorId, keyId, label, { consumeKey = false } = {}) {
  const doorRef = worldDoors.find(d => d.id === doorId);
  if (!doorRef) return;
  const lockPos = new THREE.Vector3();
  doorRef.door.pivot.updateWorldMatrix(true, false);
  doorRef.door.pivot.getWorldPosition(lockPos);
  lockPos.y = 1.0;
  // Offset toward the door face side, respecting hinge rotation
  const localOff = new THREE.Vector3(0, 0, doorRef.door.width * 0.75);
  localOff.applyQuaternion(doorRef.door.pivot.getWorldQuaternion(new THREE.Quaternion()));
  lockPos.add(localOff);
  const lock = createLock({
    id: 'lock_' + doorId,
    requiredKeyId: keyId,
    position: lockPos,
    unlockRadius: 1.5,
    verticalTolerance: 1.8,
    onUnlock({ requiredItemType }) {
      const ds = doorSystemById.get(doorId);
      if (ds && ds.setInteractionEnabled) ds.setInteractionEnabled(true);
      showActionLabel('UNLOCKED: ' + label);
      if (consumeKey) inventory.removeItem(requiredItemType, 1);
    },
  });
  locksByDoorId.set(doorId, lock);
}

createDoorLock('doorHallAdmin', 'doorHallAdmin', 'ADMIN OFFICE', { consumeKey: true });
createDoorLock('doorHallDirector', 'doorHallDirector', "DIRECTOR'S OFFICE", { consumeKey: true });
createDoorLock('doorEscape', 'escape', 'ESCAPE DOOR', { consumeKey: true });

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

enemyRuntime.setDoorSystems(doorSystems);

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

await yieldToUI(80, 'waking enemies');

// ─── Enemy AI ─────────────────────────────────────────────────────────────
const enemyAI = createEnemyAI(world, roomCulling);
enemyRuntime.setEnemyAI(enemyAI);

// Attach full AI components to all enemies and register with AI system
const worldEnemiesForAI = world.getEnemies();
for (const enemy of worldEnemiesForAI) {
  // Attach standard components if missing (bare archetype entities)
  if (!enemy.components.pathing) {
    attachEnemyComponents(enemy, { homeZone: 'lobby', aggroDepth: 2 });
  }
  enemyAI.register(enemy);
}

await yieldToUI(88, 'building hud');

// ─── HUD ───────────────────────────────────────────────────────────────────
const hud = createHUD(gun, playerHealth);
const perfOverlay = createPerfOverlay({ buildVersion: BUILD_VERSION });

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

debugMenuUI.setToggleCallback((isOpen) => {
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

const chandelierMotion = createChandelierMotionSystem(lobbyChandeliers, {
  // Disable canned idle motion so shockwaves are the primary driver.
  breezeStrengthX: 0,
  breezeStrengthZ: 0,
  microMotion: 0,
  chimeResponse: 1.22,
  maxSwing: 0.11,
  damping: 1.85,
});

// ─── Shockwave System ──────────────────────────────────────────────────────
const shockwave = createShockwaveSystem();
const shockwaveFx = createShockwaveFx(scene);
const gunshotAudio = createGunshotAudio();
const itemClackAudio = createItemClackAudio(() => camera.position, {
  debug: AUDIO_DEBUG,
});

if (AUDIO_DEBUG && typeof window !== 'undefined') {
  window.__CLACK_DEBUG__ = {
    ping: (reason = 'manual') => itemClackAudio.playDebugPing(reason),
    snapshot: () => itemClackAudio.getDebugSnapshot(),
  };
  console.log('[ClackDBG] enabled (?audioDebug=1). Use __CLACK_DEBUG__.ping() and __CLACK_DEBUG__.snapshot()');
}

// Register doors as shockwave targets
const _doorPivotPos = new THREE.Vector3();
const _doorNormalW = new THREE.Vector3();
const _doorForceDir = new THREE.Vector3();
const _chandelierTargetPos = new THREE.Vector3();
const _spiderImpulseDir = new THREE.Vector3();
const _spiderSurfaceNormal = new THREE.Vector3();

for (const doorEntry of doorSystems) {
  const door = doorEntry.door;
  shockwave.registerTarget('door', {
    getPosition() {
      // Use center of door panel as target position
      door.pivot.getWorldPosition(_doorPivotPos);
      _doorPivotPos.y += door.height * 0.5;
      return _doorPivotPos;
    },
    applyForce(forceDir, magnitude) {
      // Compute torque: cross(doorNormal, forceDir).y gives torque sign
      const interaction = doorEntry.system.getInteraction();
      _doorNormalW.copy(interaction.doorNormal);
      _doorForceDir.copy(forceDir);
      const cross = _doorNormalW.x * _doorForceDir.z - _doorNormalW.z * _doorForceDir.x;
      const torqueSign = Math.sign(cross);
      const leverArm = door.width * 0.5;
      doorEntry.system.applyExternalTorque(torqueSign * magnitude * leverArm);
    },
  });
}

// Register chandeliers as shockwave targets
for (let i = 0; i < lobbyChandeliers.length; i++) {
  const chandelierGroup = lobbyChandeliers[i].group;
  const idx = i;
  shockwave.registerTarget('chandelier', {
    getPosition() {
      // Target the hanging body, not the top anchor, so forward shots register naturally.
      chandelierGroup.getWorldPosition(_chandelierTargetPos);
      _chandelierTargetPos.y -= 1.2;
      return _chandelierTargetPos;
    },
    applyForce(forceDir, magnitude) {
      const impulseScale = 0.45;
      chandelierMotion.applyImpulse(
        idx,
        forceDir.x * magnitude * impulseScale,
        forceDir.z * magnitude * impulseScale
      );
    },
  });
}

// ─── Shockwave registration helper ─────────────────────────────────────────
// Called at startup for existing enemies, and by spawnTriggers for new ones.
function registerEnemyWithShockwave(enemy) {
  if (!enemy.components.knockback) {
    enemy.components.knockback = { velocity: new THREE.Vector3(), active: false };
  }
  if (enemy.type === 'spider') {
    // Spider shockwave: launches into a full 3D arc (gravity applied in runtime).
    // Shockwaves do not directly damage spiders; only later impacts do.
    shockwave.registerTarget('enemy', {
      getPosition() { return enemy.mesh.position; },
      applyForce(forceDir, magnitude, shockMeta = null) {
        if (enemy.components.health?.dead) return;
        const kb = enemy.components.knockback;
        const surf = enemy.components.surface;
        const spiderShock = shockMeta?.ammoConfig?.spiderShock || null;
        const combat = enemy.components.spiderCombat || (enemy.components.spiderCombat = {
          impactArmed: false,
          launchStrength: 0,
          lastImpactDamage: 0,
          lastImpactSpeed: 0,
          lastDamageSource: null,
          lastDamageAt: -Infinity,
          doorHits: Object.create(null),
        });
        const preSpeed = kb.velocity.length();
        const inwardDotBefore =
          surf && surf.normal ? forceDir.dot(surf.normal) : 0;
        _spiderImpulseDir.copy(forceDir);

        // Prevent shockwave impulses from driving wall/ceiling spiders deeper
        // into geometry: remove inward component against current surface normal.
        if (surf && surf.normal.lengthSq() > 0.0001) {
          _spiderSurfaceNormal.copy(surf.normal).normalize();
          const nDot = _spiderImpulseDir.dot(_spiderSurfaceNormal);
          if (nDot < 0) {
            _spiderImpulseDir.addScaledVector(_spiderSurfaceNormal, -nDot);
          }
          // Add a slight outward bias so blasts peel spiders off walls cleanly.
          if (Math.abs(_spiderSurfaceNormal.y) < 0.8) {
            _spiderImpulseDir.addScaledVector(_spiderSurfaceNormal, 0.25);
          }
        }

        if (_spiderImpulseDir.lengthSq() > 0.0001) {
          _spiderImpulseDir.normalize();
        } else {
          _spiderImpulseDir.copy(forceDir);
        }

        // Reduce compounding velocity when repeatedly blasted while airborne.
        if (kb.active) {
          kb.velocity.multiplyScalar(0.45);
        }

        const knockbackMult = spiderShock?.knockbackMult ?? 1;
        const launchScalar = spiderShock?.launchScalar ?? 0.82;
        const magnitudeCap = spiderShock?.magnitudeCap ?? 9.5;
        const detachThreshold = spiderShock?.detachThreshold ?? 0.85;
        const floorUpScalar = spiderShock?.upwardScalarFloor ?? 0.36;
        const wallUpScalar = spiderShock?.upwardScalarWall ?? 0.24;
        const maxLaunchSpeed = spiderShock?.maxLaunchSpeed ?? 6.8;
        const landLockTime = spiderShock?.landLockTime ?? 0.12;
        const landLockMinTravel = spiderShock?.landLockMinTravel ?? 0.22;
        const recoverFloorTime = spiderShock?.recoverFloorTime ?? 1.1;

        // Spider launch tuning: keep knockback visible but avoid repeated
        // high-energy re-impacts against nearby walls.
        const effectiveMagnitude = Math.min(magnitude * knockbackMult, magnitudeCap);

        // Tiny blasts should not force airborne state; keep spiders adhered.
        if (effectiveMagnitude < detachThreshold) {
          const tangentNudge = effectiveMagnitude * 0.05;
          if (surf && surf.normal && surf.normal.lengthSq() > 0.0001 && tangentNudge > 0) {
            _spiderSurfaceNormal.copy(surf.normal).normalize();
            _spiderImpulseDir.addScaledVector(_spiderSurfaceNormal, -_spiderImpulseDir.dot(_spiderSurfaceNormal));
            if (_spiderImpulseDir.lengthSq() > 0.0001) {
              _spiderImpulseDir.normalize();
              enemy.mesh.position.addScaledVector(_spiderImpulseDir, tangentNudge);
            }
          }

          kb.velocity.set(0, 0, 0);
          kb.active = false;
          combat.impactArmed = false;
          combat.launchStrength = 0;

          if (surf) {
            surf.airborne = false;
            surf.airborneTimer = 0;
            surf._landLockTimer = 0;
            surf._landLockMinTravel = 0;
            surf._airTravel = 0;
            surf._recoverToFloorTimer = Math.max(surf._recoverToFloorTimer || 0, 0.18);
          }

          if (SPIDER_DEBUG) {
            console.log('[SpiderDBG][ShockwaveApplySmall]', {
              id: enemy.mesh.id,
              magnitude: _dbgNum(magnitude),
              effectiveMagnitude: _dbgNum(effectiveMagnitude),
              detachThreshold: _dbgNum(detachThreshold),
              kbVel: _dbgVec3(kb.velocity),
              ammo: shockMeta?.ammoConfig?.label || 'unknown',
            });
          }
          return;
        }

        kb.velocity.addScaledVector(_spiderImpulseDir, effectiveMagnitude * launchScalar);

        // Keep a controlled upward arc; floor hits get a stronger lift than wall hits.
        if (surf && surf.normal.y > 0.5) {
          kb.velocity.y = Math.max(kb.velocity.y, 0) + effectiveMagnitude * floorUpScalar;
        } else {
          kb.velocity.y += effectiveMagnitude * wallUpScalar;
        }

        // Cap launch speed to limit tunneling/embedding against thin walls.
        const speedSq = kb.velocity.lengthSq();
        if (speedSq > maxLaunchSpeed * maxLaunchSpeed) {
          kb.velocity.multiplyScalar(maxLaunchSpeed / Math.sqrt(speedSq));
        }

        if (SPIDER_DEBUG) {
          const postSpeed = kb.velocity.length();
          const impulseDotAfter =
            surf && surf.normal ? _spiderImpulseDir.dot(surf.normal) : 0;
          console.log('[SpiderDBG][ShockwaveApply]', {
            id: enemy.mesh.id,
            magnitude: _dbgNum(magnitude),
            preSpeed: _dbgNum(preSpeed),
            postSpeed: _dbgNum(postSpeed),
            inwardDotBefore: _dbgNum(inwardDotBefore),
            impulseDotAfter: _dbgNum(impulseDotAfter),
            forceDir: _dbgVec3(forceDir),
            impulseDir: _dbgVec3(_spiderImpulseDir),
            surfNormal: _dbgVec3(surf?.normal),
            pos: _dbgVec3(enemy.mesh.position),
            ammo: shockMeta?.ammoConfig?.label || 'unknown',
          });
        }

        kb.active = true;
        combat.impactArmed = effectiveMagnitude > 0.01;
        combat.launchStrength = effectiveMagnitude;
        if (surf) {
          surf.airborne = true;
          surf.airborneTimer = 0;
          // Briefly suppress landing so spiders can separate from launch surfaces.
          surf._landLockTimer = landLockTime;
          surf._landLockMinTravel = landLockMinTravel;
          surf._airTravel = 0;
          // Additional guard: avoid instantly re-landing to the same face.
          surf._relandGuardTimer = 0.55;
          // For a short period after shockwave, bias recovery toward floor
          // re-acquisition so spiders don't keep clinging to nearby walls.
          surf._recoverToFloorTimer = recoverFloorTime;
          if (surf._launchNormal && surf.normal) {
            surf._launchNormal.copy(surf.normal).normalize();
          }
          if (surf._launchPos) {
            surf._launchPos.copy(enemy.mesh.position);
          }
        }
      },
    });
  } else {
    shockwave.registerTarget('enemy', {
      getPosition() { return enemy.mesh.position; },
      applyForce(forceDir, magnitude) {
        // Dead enemies don't react to shockwaves
        if (enemy.components.health?.dead) return;
        const kb = enemy.components.knockback;
        kb.velocity.addScaledVector(forceDir, magnitude * 0.5);
        kb.active = true;
      },
      takeDamage(/* amount */) {
        // TODO: enemy damage system — disabled for AI testing
        // if (!enemy.components.health || enemy.components.health.dead) return;
        // enemy.components.health.current = Math.max(0, enemy.components.health.current - amount);
        // if (enemy.components.health.current <= 0) enemy.components.health.dead = true;
      },
    });
  }
}

// Register all existing enemies with the shockwave system at startup
for (const enemy of world.getEnemies()) {
  registerEnemyWithShockwave(enemy);
}

// ─── Spawn Triggers ────────────────────────────────────────────────────────
const spawnTriggers = createSpawnTriggers({
  world,
  enemyAI,
  player,
  doorSystems,
  onEnemySpawned: (spider) => registerEnemyWithShockwave(spider),
});

const DEBUG_LOBBY_BACK_SPAWNS = [
  { x: -4.8, y: 0.1, z: -11.4, aiOptions: { homeZone: 'lobby', aggroDepth: 99 } },
  { x: -3.2, y: 0.1, z: -11.8, aiOptions: { homeZone: 'lobby', aggroDepth: 99 } },
  { x: -1.6, y: 0.1, z: -10.9, aiOptions: { homeZone: 'lobby', aggroDepth: 99 } },
  { x: 1.6, y: 0.1, z: -10.9, aiOptions: { homeZone: 'lobby', aggroDepth: 99 } },
  { x: 3.2, y: 0.1, z: -11.8, aiOptions: { homeZone: 'lobby', aggroDepth: 99 } },
  { x: 4.8, y: 0.1, z: -11.4, aiOptions: { homeZone: 'lobby', aggroDepth: 99 } },
  { x: -4.2, y: 0.1, z: -9.8, aiOptions: { homeZone: 'lobby', aggroDepth: 99 } },
  { x: -2.1, y: 0.1, z: -9.4, aiOptions: { homeZone: 'lobby', aggroDepth: 99 } },
  { x: 2.1, y: 0.1, z: -9.4, aiOptions: { homeZone: 'lobby', aggroDepth: 99 } },
  { x: 4.2, y: 0.1, z: -9.8, aiOptions: { homeZone: 'lobby', aggroDepth: 99 } },
];

function debugSpawnLobbySpiders() {
  const spawned = spawnTriggers.spawnSpiders(DEBUG_LOBBY_BACK_SPAWNS);
  showActionLabel(`SPAWNED ${spawned.length} SPIDERS`);
}

function debugAddAmmoStacks() {
  const regularBefore = inventory.getItemCount('ammo');
  const heavyBefore = inventory.getItemCount('ammoHeavy');

  inventory.addItem('ammo', 27);
  inventory.addItem('ammoHeavy', 27);

  const regularAdded = inventory.getItemCount('ammo') - regularBefore;
  const heavyAdded = inventory.getItemCount('ammoHeavy') - heavyBefore;

  if (regularAdded <= 0 && heavyAdded <= 0) {
    showActionLabel('NO INVENTORY SPACE');
    return;
  }

  showActionLabel(`AMMO +${regularAdded} / HEAVY +${heavyAdded}`);
}

function debugUnlockAllDoors() {
  let unlockedCount = 0;

  for (const doorEntry of doorSystems) {
    if (doorEntry.system?.setInteractionEnabled) {
      doorEntry.system.setInteractionEnabled(true);
    }

    const lock = doorEntry.lock;
    if (!lock || !lock.isLocked || !lock.isLocked()) continue;
    if (lock.unlock({ notify: false })) {
      unlockedCount += 1;
    }
  }

  showActionLabel(unlockedCount > 0 ? `UNLOCKED ${unlockedCount} DOORS` : 'ALL DOORS ALREADY UNLOCKED');
}

function debugKillAllSpiders() {
  const livingSpiders = world.getEnemies().filter(enemy => (
    enemy?.type === 'spider' && enemy.components?.health && !enemy.components.health.dead
  ));

  if (livingSpiders.length === 0) {
    showActionLabel('NO SPIDERS ACTIVE');
    return;
  }

  const livingSpiderSet = new Set(livingSpiders);
  for (const trigger of spawnTriggers.getTriggers()) {
    if (trigger.type === 'enemyDeath' && livingSpiderSet.has(trigger.watchEnemy)) {
      trigger.enabled = false;
      trigger._fired = true;
      trigger._prevEnemyDead = true;
    }
  }

  for (const spider of livingSpiders) {
    const health = spider.components.health;
    health.current = 0;
    health.dead = true;

    const knockback = spider.components.knockback;
    if (knockback) {
      knockback.active = false;
      knockback.velocity.set(0, 0, 0);
    }

    const surface = spider.components.surface;
    if (surface) {
      surface.airborne = false;
      surface.airborneTimer = 0;
    }

    const combat = spider.components.spiderCombat;
    if (combat) {
      combat.impactArmed = false;
      combat.lastPlayerHitTime = -Infinity;
    }

    const pathing = spider.components.pathing;
    if (pathing?.desiredVelocity) {
      pathing.desiredVelocity.set(0, 0, 0);
    }

    if (spider.state) {
      spider.state._deathTimer = undefined;
      spider.state._deathStartY = undefined;
    }
  }

  showActionLabel(`KILLED ${livingSpiders.length} SPIDERS`);
}

function debugSet60FpsCapEnabled(enabled) {
  debug60FpsCapEnabled = !!enabled;
  cappedFrameAccumulatorMs = 0;
  lastFrameSampleMs = performance.now();
  showActionLabel(debug60FpsCapEnabled ? '60 FPS CAP ON' : '60 FPS CAP OFF');
}

debugMenuUI.setBindings({
  spawnLobbySpiders: debugSpawnLobbySpiders,
  addAmmoStacks: debugAddAmmoStacks,
  unlockAllDoors: debugUnlockAllDoors,
  killAllSpiders: debugKillAllSpiders,
  get60FpsCapEnabled: () => debug60FpsCapEnabled,
  set60FpsCapEnabled: debugSet60FpsCapEnabled,
});

// ─── Gameplay Loop: Spawn Trigger Definitions ──────────────────────────────

// D1: First Encounter — enter east hallway (4 ceiling spiders)
spawnTriggers.addTrigger({
  type: 'playerZone',
  roomId: 'eastHallway',
  oneShot: true,
  spawns: [
    { x: 9.0, y: 2.8, z: 2.5, wallNormal: new THREE.Vector3(0, -1, 0), aiOptions: { homeZone: 'eastHallway', aggroDepth: 99 } },
    { x: 12.0, y: 2.8, z: 1.5, wallNormal: new THREE.Vector3(0, -1, 0), aiOptions: { homeZone: 'eastHallway', aggroDepth: 99 } },
    { x: 15.0, y: 2.8, z: 2.5, wallNormal: new THREE.Vector3(0, -1, 0), aiOptions: { homeZone: 'eastHallway', aggroDepth: 99 } },
    { x: 17.0, y: 2.8, z: 1.5, wallNormal: new THREE.Vector3(0, -1, 0), aiOptions: { homeZone: 'eastHallway', aggroDepth: 99 } },
  ],
});

// D2: Admin Ambush — opening the Admin Office door (6 spiders in hallway)
// 2 of these are marked for death-cascade (D5)
const adminAmbushMarked = [];
spawnTriggers.addTrigger({
  type: 'doorOpen',
  doorId: 'doorHallAdmin',
  oneShot: true,
  spawns: [
    { x: 8.5, y: 0.1, z: 2.5, aiOptions: { homeZone: 'eastHallway', aggroDepth: 99 } },
    { x: 10.5, y: 0.1, z: 1.5, aiOptions: { homeZone: 'eastHallway', aggroDepth: 99 } },
    { x: 12.5, y: 2.8, z: 3.5, wallNormal: new THREE.Vector3(0, -1, 0), aiOptions: { homeZone: 'eastHallway', aggroDepth: 99 } },
    { x: 14.0, y: 0.1, z: 2.0, aiOptions: { homeZone: 'eastHallway', aggroDepth: 99 } },
    { x: 16.5, y: 0.1, z: 1.5, aiOptions: { homeZone: 'eastHallway', aggroDepth: 99 } },
    { x: 18.0, y: 2.8, z: 2.5, wallNormal: new THREE.Vector3(0, -1, 0), aiOptions: { homeZone: 'eastHallway', aggroDepth: 99 } },
  ],
  onSpawn(spiders) {
    // Mark first two for death-cascade
    if (spiders[0]) adminAmbushMarked.push(spiders[0]);
    if (spiders[1]) adminAmbushMarked.push(spiders[1]);
    // Register death-cascade triggers for marked enemies
    for (const marked of adminAmbushMarked) {
      spawnTriggers.addTrigger({
        type: 'enemyDeath',
        watchEnemy: marked,
        oneShot: true,
        spawns: [
          { x: 16.0, y: 0.1, z: -1.5, aiOptions: { homeZone: 'eastKitchen', aggroDepth: 99 } },
          { x: 10.0, y: 0.1, z: -1.0, aiOptions: { homeZone: 'eastManager', aggroDepth: 99 } },
          { x: 14.5, y: 0.1, z: 2.5, aiOptions: { homeZone: 'eastHallway', aggroDepth: 99 } },
        ],
      });
    }
  },
});

// D3: Director's Trap — entering Director's Office (8 spiders behind player in hallway)
// 2 of these are marked for death-cascade; also enables the finale trigger
const directorTrapMarked = [];
spawnTriggers.addTrigger({
  type: 'playerZone',
  roomId: 'eastDirector',
  oneShot: true,
  spawns: [
    { x: 8.0, y: 0.1, z: 2.5, aiOptions: { homeZone: 'eastHallway', aggroDepth: 99 } },
    { x: 9.5, y: 0.1, z: 1.5, aiOptions: { homeZone: 'eastHallway', aggroDepth: 99 } },
    { x: 11.0, y: 2.8, z: 3.5, wallNormal: new THREE.Vector3(0, -1, 0), aiOptions: { homeZone: 'eastHallway', aggroDepth: 99 } },
    { x: 12.5, y: 0.1, z: 2.0, aiOptions: { homeZone: 'eastHallway', aggroDepth: 99 } },
    { x: 14.0, y: 0.1, z: 1.5, aiOptions: { homeZone: 'eastHallway', aggroDepth: 99 } },
    { x: 15.5, y: 2.8, z: 2.5, wallNormal: new THREE.Vector3(0, -1, 0), aiOptions: { homeZone: 'eastHallway', aggroDepth: 99 } },
    { x: 17.0, y: 0.1, z: 2.5, aiOptions: { homeZone: 'eastHallway', aggroDepth: 99 } },
    { x: 18.5, y: 0.1, z: 1.5, aiOptions: { homeZone: 'eastHallway', aggroDepth: 99 } },
  ],
  onSpawn(spiders) {
    if (spiders[0]) directorTrapMarked.push(spiders[0]);
    if (spiders[1]) directorTrapMarked.push(spiders[1]);
    for (const marked of directorTrapMarked) {
      spawnTriggers.addTrigger({
        type: 'enemyDeath',
        watchEnemy: marked,
        oneShot: true,
        spawns: [
          { x: 8.5, y: 0.1, z: 6.0, aiOptions: { homeZone: 'eastReception', aggroDepth: 99 } },
          { x: 17.0, y: 0.1, z: -2.0, aiOptions: { homeZone: 'eastKitchen', aggroDepth: 99 } },
          { x: 13.0, y: 2.8, z: 2.5, wallNormal: new THREE.Vector3(0, -1, 0), aiOptions: { homeZone: 'eastHallway', aggroDepth: 99 } },
        ],
      });
    }
  },
  onFire(allTriggers) {
    // Enable the lobby finale trigger
    const finaleTrigger = allTriggers.find(t => t._finaleTag);
    if (finaleTrigger) finaleTrigger.enabled = true;
  },
});

// D4: THE FINALE — re-enter lobby after Director's Office (100 spiders, staggered)
// Builds spawn array: ~30 left wall + ~30 right wall + ~20 ceiling + ~20 floor
const finaleSpawns = [];
const lobbyAI = { homeZone: 'lobby', aggroDepth: 99 };

// Left wall spiders (X ≈ -6.82, various Y and Z)
for (let i = 0; i < 30; i++) {
  finaleSpawns.push({
    x: -6.82,
    y: 0.5 + Math.random() * 4.5,
    z: -12 + Math.random() * 24,
    wallNormal: new THREE.Vector3(1, 0, 0),
    aiOptions: lobbyAI,
  });
}
// Right wall spiders (X ≈ 6.82)
for (let i = 0; i < 30; i++) {
  finaleSpawns.push({
    x: 6.82,
    y: 0.5 + Math.random() * 4.5,
    z: -12 + Math.random() * 24,
    wallNormal: new THREE.Vector3(-1, 0, 0),
    aiOptions: lobbyAI,
  });
}
// Ceiling spiders (Y ≈ 5.3)
for (let i = 0; i < 20; i++) {
  finaleSpawns.push({
    x: -5 + Math.random() * 10,
    y: 5.3,
    z: -10 + Math.random() * 20,
    wallNormal: new THREE.Vector3(0, -1, 0),
    aiOptions: lobbyAI,
  });
}
// Floor spiders between player entry area and escape door
for (let i = 0; i < 20; i++) {
  finaleSpawns.push({
    x: -5 + Math.random() * 10,
    y: 0.1,
    z: -12 + Math.random() * 16,
    aiOptions: lobbyAI,
  });
}

spawnTriggers.addTrigger({
  _finaleTag: true,
  type: 'playerZone',
  roomId: 'lobby',
  oneShot: true,
  enabled: false, // enabled by D3 onFire
  staggerDelay: 0.5,  // 0.5 seconds between batches
  batchSize: 15,       // 15 spiders per batch
  spawns: finaleSpawns,
});

// D6: South Offshoot Rooms Mini-Encounter (optional)
spawnTriggers.addTrigger({
  type: 'playerZone',
  roomId: 'sideRoomEast',
  oneShot: true,
  spawns: [
    { x: -9.2, y: 0.1, z: 1.5, aiOptions: { homeZone: 'sideRoomEast', aggroDepth: 99 } },
    { x: -13.2, y: 0.1, z: 3.0, aiOptions: { homeZone: 'sideRoomMid', aggroDepth: 99 } },
    { x: -17.2, y: 0.1, z: 2.5, aiOptions: { homeZone: 'sideRoomWest', aggroDepth: 99 } },
  ],
});

// ─── Victory & Game State ──────────────────────────────────────────────────
let gameWon = false;
const victoryOverlay = document.createElement('div');
victoryOverlay.style.cssText = `
  position: fixed; inset: 0;
  display: none;
  background: rgba(0, 0, 0, 0.85);
  z-index: 9999;
  justify-content: center; align-items: center;
  flex-direction: column;
  cursor: pointer;
`;
victoryOverlay.innerHTML = `
  <div style="color: #9be5ff; font-family: monospace; font-size: 48px; font-weight: bold; letter-spacing: 0.15em; text-shadow: 0 0 20px rgba(155,229,255,0.5);">YOU ESCAPED</div>
  <div style="color: #ddd; font-family: monospace; font-size: 16px; margin-top: 24px;">click to restart</div>
`;
document.body.appendChild(victoryOverlay);

victoryOverlay.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  location.reload();
});

function checkVictory() {
  if (gameWon) return;
  // Check if escape door is open past threshold
  const escapeDoorEntry = doorSystems.find(d => d.id === 'doorEscape');
  if (!escapeDoorEntry) return;
  const angle = Math.abs(escapeDoorEntry.system.getInteraction().doorAngle ?? 0);
  if (angle > 0.3) {
    gameWon = true;
    victoryOverlay.style.display = 'flex';
    try { document.exitPointerLock(); } catch {}
  }
}

// Register shakeable furniture
const worldShakeables = world.getShakeables();
for (const mesh of worldShakeables) {
  shockwave.registerTarget('shakeable', {
    getPosition() { return mesh.position; },
    applyForce(_forceDir, magnitude) {
      shockwave.shakeObject(mesh, magnitude * 0.3);
    },
  });
}

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
  gameWon = false;
  victoryOverlay.style.display = 'none';
  playerHealth.reset();
  damageEffects.reset();
  shockwaveFx.clear();
  gunshotAudio.clear();
  itemClackAudio.clear();
  player.resetPosition();
  for (const key in hazardTimers) hazardTimers[key] = 0;
  enemyRuntime.reset();
  spawnTriggers.reset();

  // Reset inventory to starting loadout
  for (let i = 0; i < 9; i++) {
    const s = inventory.getSlot(i);
    if (s.itemType) inventory.removeItem(s.itemType, s.quantity);
  }
  inventory.setEquippedDirect('handgun', 1);

  for (const enemy of world.getEnemies()) {
    // Restore spawn position
    if (enemy._spawnPos) {
      enemy.mesh.position.copy(enemy._spawnPos);
      enemy.mesh.rotation.set(0, Math.PI, 0);
    }
    // Restore health
    const health = enemy.components.health;
    if (health) {
      health.current = health.max;
      health.dead = false;
    }
    // Clear death animation state
    if (enemy.state) {
      enemy.state._deathTimer = undefined;
      enemy.state._deathStartY = undefined;
    }
    // Clear knockback
    const kb = enemy.components.knockback;
    if (kb) { kb.active = false; kb.velocity.set(0, 0, 0); }
    // Reset surface adhesion (spiders) — restore spawn normal (wall or floor)
    const surf = enemy.components.surface;
    if (surf) {
      surf.airborne = false;
      surf.airborneTimer = 0;
      if (enemy._spawnNormal) surf.normal.copy(enemy._spawnNormal);
      else surf.normal.set(0, 1, 0);
    }
    // Reset spider bite cooldowns
    const combat = enemy.components.spiderCombat;
    if (combat) { combat.lastPlayerHitTime = -Infinity; combat.impactArmed = false; }
    // Clear AI velocity
    const pathing = enemy.components.pathing;
    if (pathing) pathing.desiredVelocity.set(0, 0, 0);
  }

  // Re-lock all locked doors
  for (const [doorId, lock] of locksByDoorId) {
    lock.lock();
    const ds = doorSystemById.get(doorId);
    if (ds && ds.setInteractionEnabled) ds.setInteractionEnabled(false);
  }
}

// ─── Start overlay ─────────────────────────────────────────────────────────
const overlay = document.getElementById('overlay');
const startPrompt = document.getElementById('start-prompt');
const loadingBarTrack = document.getElementById('loading-bar-track');

let isStartupLoading = true;

// ─── Warm-up: run full simulation frames so first gameplay frame is instant ─
// The goal is to exercise every code path the real loop uses: player update,
// physics, enemy AI, lazy spider init, shader compilation, shadow maps, etc.
// We yield between passes so the loading bar stays animated.

const WARMUP_FRAMES = 8;
const WARMUP_DT = 1 / 60;

for (let i = 0; i < WARMUP_FRAMES; i++) {
  const pct = 90 + Math.round((i / WARMUP_FRAMES) * 10);
  const labels = [
    'warming up physics',
    'ticking simulation',
    'initializing enemies',
    'building visibility',
    'compiling shaders',
    'rendering shadows',
    'finalizing',
    'almost ready',
  ];
  await yieldToUI(pct, labels[i] || 'warming up');

  // Full simulation tick (mirrors the gameplay branch of the main loop)
  gun.update(WARMUP_DT);
  const gunState = gun.getAmmoState();
  stepPhysics(physicsWorld, WARMUP_DT);

  for (const doorEntry of doorSystems) {
    doorEntry.system.update(WARMUP_DT);
  }
  const doorInteraction = getBestDoorInteraction();
  player.update(WARMUP_DT, gunState, doorInteraction);
  for (const doorEntry of doorSystems) {
    doorEntry.system.applyPlayerPushback(player);
  }
  enemyRuntime.update(WARMUP_DT);
  spawnTriggers.update(WARMUP_DT);
  worldItems.update(WARMUP_DT);
  roomCulling.update();

  updateHazards(WARMUP_DT);
  shockwave.update(WARMUP_DT);
  shockwaveFx.update(WARMUP_DT);
  chandelierMotion.update(WARMUP_DT);

  inventoryUI.update(WARMUP_DT);
  debugMenuUI.update(WARMUP_DT);
  hud.update(WARMUP_DT);
  damageEffects.update(WARMUP_DT);
  fog.update(WARMUP_DT);

  // Force shadow maps to compile on the first couple of passes
  if (i < 2) {
    renderer.shadowMap.needsUpdate = true;
  }
  renderer.render(scene, camera);
}

// One last yield at 100% then transition to ready
await yieldToUI(100, 'ready');

// Loading complete — show start prompt
if (loadingBarTrack) loadingBarTrack.style.display = 'none';
if (startPrompt) startPrompt.style.display = '';
if (_loadStatus) _loadStatus.style.display = 'none';

if (overlay) {
  overlay.style.cursor = 'pointer';
  overlay.style.pointerEvents = 'all';
}

function beginGameplay() {
  if (!overlay) return;

  isStartupLoading = false;
  gunshotAudio.unlock();
  itemClackAudio.unlock();

  lastFrameSampleMs = performance.now();
  cappedFrameAccumulatorMs = 0;

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

// ─── Clock & Loop ──────────────────────────────────────────────────────────
const DEBUG_FPS_CAP_60_INTERVAL_MS = 1000 / 60;
let debug60FpsCapEnabled = false;
let lastFrameSampleMs = performance.now();
let cappedFrameAccumulatorMs = 0;

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
let lastNoclipState = false;

window.addEventListener('keydown', e => {
  if (e.code !== 'KeyQ' || e.repeat) return;
  if (isStartupLoading || playerHealth.isDead()) return;

  if (debugMenuUI.isOpen()) debugMenuUI.close();
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

window.addEventListener('keydown', e => {
  if (e.code !== 'KeyN' || e.repeat) return;
  if (isStartupLoading || playerHealth.isDead()) return;

  if (inventoryUI.isOpen()) inventoryUI.toggle();
  debugMenuUI.toggle();

  // Closing debug menu from this keydown is a user gesture, so attempt immediate relock.
  if (!debugMenuUI.isOpen() && !player.controls.isLocked) {
    try {
      player.lock();
    } catch {
      // Some browsers may still deny; click-to-relock fallback remains active.
    }
  }
});

function handleImmediateActionInput(menuOpen) {
  if (menuOpen) return;

  if (player.keys['KeyR']) {
    gun.reload();
  }

  if (player.keys['MouseLeft']) {
    const fireResult = gun.fire();
    if (fireResult.success) {
      const ammoConfig = getAmmoConfigForItem(fireResult.ammoItemType);
      const shockResult = shockwave.fire(
        fireResult.shockwaveOrigin,
        fireResult.shockwaveDirection,
        ammoConfig,
      );
      shockwaveFx.spawnMuzzleWave(
        fireResult.shockwaveOrigin,
        fireResult.shockwaveDirection,
        ammoConfig,
        fireResult.hitInfo,
      );
      gunshotAudio.playShot(ammoConfig);
      itemClackAudio.triggerFromShockwave(shockResult.hits, fireResult.shockwaveOrigin);
    }
  }
}

function loop(frameTimeMs = performance.now()) {
  requestAnimationFrame(loop);

  const rawDtMs = Math.max(0, frameTimeMs - lastFrameSampleMs);
  lastFrameSampleMs = frameTimeMs;

  let dt = rawDtMs / 1000;
  if (debug60FpsCapEnabled) {
    cappedFrameAccumulatorMs += rawDtMs;
    if (cappedFrameAccumulatorMs + 0.1 < DEBUG_FPS_CAP_60_INTERVAL_MS) {
      return;
    }
    dt = cappedFrameAccumulatorMs / 1000;
    cappedFrameAccumulatorMs = Math.max(0, cappedFrameAccumulatorMs - DEBUG_FPS_CAP_60_INTERVAL_MS);
  } else {
    cappedFrameAccumulatorMs = 0;
  }

  dt = Math.min(dt, 0.05);

  const noclipActive = !!(player.isNoclipEnabled && player.isNoclipEnabled());
  if (noclipActive !== lastNoclipState) {
    showActionLabel(noclipActive ? 'NOCLIP ON' : 'NOCLIP OFF');
    lastNoclipState = noclipActive;
  }

  if (actionLabelTimer > 0) {
    actionLabelTimer -= dt;
    if (actionLabelTimer <= 0) {
      actionLabel.style.display = 'none';
      actionLabelTimer = 0;
    }
  }

  if (isStartupLoading) {
    updateFlashlightShadowRefresh(dt, false);
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
  const menuOpen = inventoryUI.isOpen() || debugMenuUI.isOpen();

  if (!dead) gun.update(dt);

  const gunState = gun.getAmmoState();
  if (gunState.isFiring) {
    muzzleShadowBurstTimer = 0.18;
  } else if (muzzleShadowBurstTimer > 0) {
    muzzleShadowBurstTimer = Math.max(0, muzzleShadowBurstTimer - dt);
  }

  // Freeze camera rotation while a menu is open.
  if (menuOpen && savedCameraQuaternion) {
    camera.quaternion.copy(savedCameraQuaternion);
  }

  if (!dead) {
    handleImmediateActionInput(menuOpen);
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
    spawnTriggers.update(dt);
    worldItems.update(dt);
    checkVictory();
  }

  if (gameWon) {
    renderer.render(scene, camera);
    return;
  }

  roomCulling.update();

  // ─── Input ──────────────────────────────────────────────────────────────
  if (!dead) {
    // E key: pickup item
    const eKeyPressed = player.keys['KeyE'];
    if (eKeyPressed && !lastEKeyState) {
      if (!menuOpen && worldItems.getHovered()) {
        worldItems.tryPickup();
      }
    }
    lastEKeyState = eKeyPressed;
  }

  // ─── Hazard tick damage ─────────────────────────────────────────────────
  updateHazards(dt);
  shockwave.update(dt);
  shockwaveFx.update(dt);
  chandelierMotion.update(dt);

  inventoryUI.update(dt);
  debugMenuUI.update(dt);
  hud.update(dt);
  damageEffects.update(dt);
  fog.update(dt);

  const flashlightShadowsActive = !dead
    && player.getFlashlightOn
    && player.getFlashlightOn()
    && !menuOpen;
  const muzzleShadowsActive = !dead && muzzleShadowBurstTimer > 0 && !menuOpen;
  updateFlashlightShadowRefresh(dt, flashlightShadowsActive || muzzleShadowsActive);

  renderer.render(scene, camera);

  const roomStats = roomCulling.getStats();
  perfOverlay.update(dt, {
    fpsCapEnabled: debug60FpsCapEnabled,
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
