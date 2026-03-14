import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { createViewModel } from './viewmodel.js';

const PLAYER_HEIGHT = 1.7;
const MOVE_SPEED    = 2.2;
const SPRINT_MULT   = 1.5;
const GRAVITY       = -18;
const JUMP_FORCE    = 5;
const PLAYER_RADIUS = 0.3;
const STEP_HEIGHT   = 0.45;
const ACCEL         = 0.14;
const DECEL         = 0.08;
const MOUSE_SENS    = 0.002;
const NOCLIP_SPEED  = 5.5;
const NOCLIP_SPRINT_MULT = 2.2;

export function createPlayer(camera, scene, world, physicsWorld, inventoryUI, playerHealth = null) {
  // ─── Body / camera hierarchy ─────────────────────────────────────────────
  const body = new THREE.Group();
  body.position.set(0, 1.2 + PLAYER_HEIGHT, 4);
  scene.add(body);

  camera.position.set(0, 0, 0);
  body.add(camera);

  const controls = new PointerLockControls(camera, document.body);
  const viewmodel = createViewModel(camera);

  // ─── Fallback mode (for environments without Pointer Lock, e.g. preview) ─
  let fallbackMode = false;
  let fallbackActive = false;   // true once the player clicks to start in fallback
  let hasEverPointerLock = false;
  let noclipEnabled = false;
  let windowFocused = document.hasFocus();
  let tabVisible = document.visibilityState !== 'hidden';
  const keys = {};
  let fallbackYaw   = 0;
  let fallbackPitch = 0;
  const enemyTargetPosition = new THREE.Vector3();

  function applyCursorMode() {
    const inventoryOpen = !!(inventoryUI && inventoryUI.isOpen && inventoryUI.isOpen());
    if (inventoryOpen || controls.isLocked || fallbackActive) {
      document.body.style.cursor = 'none';
      return;
    }
    document.body.style.cursor = '';
  }

  function canCaptureGameplayMouse() {
    const inventoryOpen = !!(inventoryUI && inventoryUI.isOpen && inventoryUI.isOpen());
    const overlay = document.getElementById('overlay');
    const overlayVisible = !!(overlay && window.getComputedStyle(overlay).display !== 'none');
    return windowFocused && tabVisible && !inventoryOpen && !overlayVisible;
  }

  function tryLockFromUserGesture() {
    if (controls.isLocked || fallbackActive) return false;
    if (!canCaptureGameplayMouse()) return false;

    try {
      controls.lock();
      return true;
    } catch {
      return false;
    }
  }

  function enableFallback() {
    if (controls.isLocked) return;
    fallbackMode = true;
    fallbackActive = true;
    applyCursorMode();
  }

  controls.addEventListener('lock', () => {
    hasEverPointerLock = true;
    fallbackMode = false;
    fallbackActive = false;
    applyCursorMode();
  });

  controls.addEventListener('unlock', () => {
    applyCursorMode();
  });

  window.addEventListener('focus', () => {
    windowFocused = true;
    applyCursorMode();
  });

  window.addEventListener('blur', () => {
    windowFocused = false;
    for (const key in keys) keys[key] = false;
    applyCursorMode();
  });

  document.addEventListener('visibilitychange', () => {
    tabVisible = document.visibilityState !== 'hidden';
    if (!tabVisible) {
      for (const key in keys) keys[key] = false;
    }
    applyCursorMode();
  });

  // ─── Input ───────────────────────────────────────────────────────────────
  let flashlightOn = false;
  window.addEventListener('keydown', e => { 
    if (e.code === 'KeyN' && !e.repeat) {
      noclipEnabled = !noclipEnabled;
      enemyTargetPosition.copy(body.position);
      velY = 0;
      onGround = false;
      wasOnGround = false;
      if (!noclipEnabled) {
        velocity.set(0, 0, 0);
      }
    }
    keys[e.code] = true; 
    if (e.code === 'KeyF') flashlightOn = !flashlightOn; 
  });
  window.addEventListener('keyup',   e => { keys[e.code] = false; });

  // Mouse button tracking (for gun fire, etc.)
  document.addEventListener('mousedown', e => {
    const didStartLock = e.button === 0 ? tryLockFromUserGesture() : false;

    if (e.button === 0) keys['MouseLeft'] = true; // Left click

    // Do not treat relock clicks as a fire input.
    if (didStartLock) keys['MouseLeft'] = false;
  });
  document.addEventListener('mouseup', e => {
    if (e.button === 0) keys['MouseLeft'] = false;
  });

  let mouseDX = 0, mouseDY = 0;
  document.addEventListener('mousemove', e => {
    const active = controls.isLocked || fallbackActive;
    if (!active) return;

    // Don't process mouse look if inventory is open (but still track movement for sway)
    const shouldUpdateLook = !(inventoryUI && inventoryUI.isOpen());

    // movementX/Y work even without pointer lock in most browsers
    const dx = e.movementX || 0;
    const dy = e.movementY || 0;

    if (shouldUpdateLook) {
      mouseDX += dx;
      mouseDY += dy;

      // In fallback mode, manually rotate the camera (PLControls won't do it)
      if (fallbackActive && !controls.isLocked) {
        fallbackYaw   -= dx * MOUSE_SENS;
        fallbackPitch -= dy * MOUSE_SENS;
        fallbackPitch  = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, fallbackPitch));

        const euler = new THREE.Euler(fallbackPitch, fallbackYaw, 0, 'YXZ');
        camera.quaternion.setFromEuler(euler);
      }
    }
  });

  // ─── Physics Body (Kinematic Capsule) ───────────────────────────────────
  // Create a kinematic body for the player (we control its movement)
  const playerShape = new CANNON.Sphere(PLAYER_RADIUS);
  const playerPhysicsBody = new CANNON.Body({ 
    mass: 0, // Kinematic (infinite mass, no gravity affects it)
    shape: playerShape 
  });
  playerPhysicsBody.position.set(body.position.x, body.position.y - PLAYER_HEIGHT + PLAYER_RADIUS, body.position.z);
  physicsWorld.addBody(playerPhysicsBody);

  // ─── Reusable vectors ────────────────────────────────────────────────────
  const forward   = new THREE.Vector3();
  const right     = new THREE.Vector3();
  const up        = new THREE.Vector3(0, 1, 0);
  const dir       = new THREE.Vector3();
  const targetVel = new THREE.Vector3();
  const playerBox = new THREE.Box3();

  // ─── Physics state ───────────────────────────────────────────────────────
  let velY        = 0;
  let onGround    = false;
  let wasOnGround = false;

  const velocity = new THREE.Vector3(0, 0, 0);

  // ─── Sway state ──────────────────────────────────────────────────────────
  let swayPhase = 0;
  let lowHealthSwayPhase = 0;

  enemyTargetPosition.copy(body.position);

  // ─── Collision helpers (AABB-based, fast) ───────────────────────────────
  function buildPlayerBox(pos) {
    playerBox.min.set(pos.x - PLAYER_RADIUS, pos.y - PLAYER_HEIGHT, pos.z - PLAYER_RADIUS);
    playerBox.max.set(pos.x + PLAYER_RADIUS, pos.y,                  pos.z + PLAYER_RADIUS);
  }

  function resolveCollisions(pos) {
    buildPlayerBox(pos);
    for (const box of world.colliders) {
      if (box._enemyCollider) continue;
      if (!playerBox.intersectsBox(box)) continue;

      const ox = Math.min(playerBox.max.x - box.min.x, box.max.x - playerBox.min.x);
      const oy = Math.min(playerBox.max.y - box.min.y, box.max.y - playerBox.min.y);
      const oz = Math.min(playerBox.max.z - box.min.z, box.max.z - playerBox.min.z);

      if (oy < ox && oy < oz) {
        if (pos.y > (box.min.y + box.max.y) / 2) {
          pos.y += oy;
          onGround = true;
          velY = 0;
        } else {
          pos.y -= oy;
          velY = 0;
        }
      } else if (wasOnGround && oy <= STEP_HEIGHT && velY <= 0) {
        pos.y += oy + 0.01;
        velY = 0;
      } else if (ox < oz) {
        pos.x += pos.x < (box.min.x + box.max.x) / 2 ? -ox : ox;
      } else {
        pos.z += pos.z < (box.min.z + box.max.z) / 2 ? -oz : oz;
      }

      buildPlayerBox(pos);
    }
  }

  // ─── Update ──────────────────────────────────────────────────────────────
  function update(dt, gunState = {}, doorInteraction = null) {
    applyCursorMode();

    // Require pointer lock or fallback mode to be active
    if (!controls.isLocked && !fallbackActive) return;

    const pos    = body.position;
    const sprint = keys['ShiftLeft'] || keys['ShiftRight'];
    const speed  = MOVE_SPEED * (sprint ? SPRINT_MULT : 1);

    if (noclipEnabled) {
      const noclipSpeed = NOCLIP_SPEED * (sprint ? NOCLIP_SPRINT_MULT : 1);

      camera.getWorldDirection(forward);
      forward.normalize();
      right.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();

      dir.set(0, 0, 0);
      if (keys['KeyW'] || keys['ArrowUp']) dir.add(forward);
      if (keys['KeyS'] || keys['ArrowDown']) dir.addScaledVector(forward, -1);
      if (keys['KeyD'] || keys['ArrowRight']) dir.add(right);
      if (keys['KeyA'] || keys['ArrowLeft']) dir.addScaledVector(right, -1);
      if (keys['Space']) dir.add(up);
      if (keys['ControlLeft'] || keys['ControlRight']) dir.addScaledVector(up, -1);

      const wantsMoveNoclip = dir.lengthSq() > 0;
      targetVel.set(0, 0, 0);
      if (wantsMoveNoclip) {
        dir.normalize();
        targetVel.copy(dir).multiplyScalar(noclipSpeed);
      }

      const noclipBlend = wantsMoveNoclip ? 0.22 : 0.18;
      velocity.x += (targetVel.x - velocity.x) * noclipBlend;
      velocity.y += (targetVel.y - velocity.y) * noclipBlend;
      velocity.z += (targetVel.z - velocity.z) * noclipBlend;

      pos.addScaledVector(velocity, dt);
      velY = 0;
      onGround = false;
      wasOnGround = false;

      playerPhysicsBody.position.set(pos.x, pos.y - PLAYER_HEIGHT + PLAYER_RADIUS, pos.z);

      camera.position.x += (0 - camera.position.x) * 0.2;
      camera.position.y += (0 - camera.position.y) * 0.2;

      viewmodel.update(dt, false, sprint, mouseDX, mouseDY, flashlightOn, gunState, doorInteraction);
      mouseDX = 0;
      mouseDY = 0;

      world.update(dt);
      return;
    }

    // ── Direction from camera look (yaw only) ────────────────────────────
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    right.set(-forward.z, 0, forward.x);

    dir.set(0, 0, 0);
    if (keys['KeyW'] || keys['ArrowUp'])    dir.z += 1;
    if (keys['KeyS'] || keys['ArrowDown'])  dir.z -= 1;
    if (keys['KeyA'] || keys['ArrowLeft'])  dir.x -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) dir.x += 1;
    dir.normalize();

    const wantsMove = dir.lengthSq() > 0;

    // ── Smooth velocity (chunky start/stop) ──────────────────────────────
    targetVel.set(0, 0, 0);
    if (wantsMove) {
      targetVel.addScaledVector(forward, dir.z);
      targetVel.addScaledVector(right, dir.x);
      targetVel.normalize().multiplyScalar(speed);
    }

    const blend = wantsMove ? ACCEL : DECEL;
    velocity.x += (targetVel.x - velocity.x) * blend;
    velocity.z += (targetVel.z - velocity.z) * blend;

    pos.x += velocity.x * dt;
    pos.z += velocity.z * dt;

    const isMoving = (velocity.x * velocity.x + velocity.z * velocity.z) > 0.2;

    // ── Gravity ──────────────────────────────────────────────────────────
    wasOnGround = onGround;
    onGround = false;
    velY += GRAVITY * dt;
    pos.y += velY * dt;

    // ── Collision ────────────────────────────────────────────────────────
    resolveCollisions(pos);

    // ── Jump ─────────────────────────────────────────────────────────────
    if (keys['Space'] && onGround) {
      velY = JUMP_FORCE;
      onGround = false;
    }

    // ── Update physics body to match camera position (for future enemy interaction) ──
    playerPhysicsBody.position.set(pos.x, pos.y - PLAYER_HEIGHT + PLAYER_RADIUS, pos.z);

    // ── Camera sway / head bob ───────────────────────────────────────────
    if (isMoving && onGround) {
      swayPhase += dt * (sprint ? 10 : 6.5);
    } else {
      swayPhase *= 0.92;
    }

    const bobY = Math.sin(swayPhase * 2) * (sprint ? 0.022 : 0.013);
    const bobX = Math.cos(swayPhase) * (sprint ? 0.012 : 0.007);

    camera.position.x += (bobX - camera.position.x) * 0.12;
    camera.position.y += (bobY - camera.position.y) * 0.12;

    // ── Low-health sway (wobbly drunk-walk at 1 HP) ──────────────────────
    if (playerHealth && !playerHealth.isDead()) {
      const hp = playerHealth.getHealth();
      if (hp === 1) {
        lowHealthSwayPhase += dt * 1.8;
        const swayX = Math.sin(lowHealthSwayPhase * 0.7) * 0.012 + Math.sin(lowHealthSwayPhase * 1.3) * 0.006;
        const swayY = Math.cos(lowHealthSwayPhase * 0.5) * 0.008;
        camera.position.x += swayX;
        camera.position.y += swayY;
      } else {
        lowHealthSwayPhase *= 0.95; // Gradually settle when healing
      }
    }

    // ── Viewmodel ────────────────────────────────────────────────────────
    viewmodel.update(dt, isMoving && onGround, sprint, mouseDX, mouseDY, flashlightOn, gunState, doorInteraction);
    mouseDX = 0;
    mouseDY = 0;

    world.update(dt);

    enemyTargetPosition.copy(pos);
  }

  function getPosition() {
    return body.position;
  }

  function getVelocity() {
    return velocity;
  }

  function resetPosition() {
    body.position.set(0, 1.2 + PLAYER_HEIGHT, 4);
    enemyTargetPosition.copy(body.position);
    velY = 0;
    velocity.set(0, 0, 0);
    onGround = false;
    wasOnGround = false;
    noclipEnabled = false;
    lowHealthSwayPhase = 0;
  }

  return {
    lock:   () => controls.lock(),
    unlock: () => controls.unlock(),
    enableFallback,
    hasEverPointerLock: () => hasEverPointerLock,
    refreshCursorMode: applyCursorMode,
    update,
    keys,
    controls,
    getPosition,
    getEnemyTargetPosition: () => enemyTargetPosition,
    getVelocity,
    getFlashlightOn: () => flashlightOn,
    isNoclipEnabled: () => noclipEnabled,
    resetPosition,
  };
}

