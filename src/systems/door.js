import * as THREE from 'three';

export function createDoorSystem(door, player, camera, options = {}) {
  let angle = 0;
  let angularVelocity = 0;
  let interactionBlend = 0;
  let interactionEnabled = options.interactionEnabled !== false;

  const lock = options.lock || null;
  const getHeldItemType = typeof options.getHeldItemType === 'function'
    ? options.getHeldItemType
    : () => null;

  const doorNormalWorld = new THREE.Vector3(1, 0, 0);
  const tempQuat = new THREE.Quaternion();
  const invQuat = new THREE.Quaternion();
  const tempVec = new THREE.Vector3();
  const localPos = new THREE.Vector3();
  const localVel = new THREE.Vector3();
  const lastPlayerPos = new THREE.Vector3();
  const pivotWorldPos = new THREE.Vector3();
  const pushNormal = new THREE.Vector3();
  let hasLastPos = false;

  // Physical door properties
  const DOOR_MASS = 40;  // kg — heavy old wooden cabin door
  const DOOR_I = (1 / 3) * DOOR_MASS * door.width * door.width; // moment of inertia about hinge
  const PLAYER_RADIUS = 0.3;
  const CONTACT_DIST = PLAYER_RADIUS + door.thickness / 2; // pushback threshold
  const PUSH_DETECT = CONTACT_DIST + 0.25; // wider zone so push registers before pushback resolves overlap
  const CONTACT_FORCE_PENETRATION = 17;
  const CONTACT_FORCE_VELOCITY = 4;
  const AUTO_CLOSE_SPRING = 0.02;
  const AUTO_CLOSE_DAMPING = 0.998;
  const PRE_FRAME_CUSHION_ZONE = 0.035;
  const CROSS_FRAME_FRICTION_ZONE = 0.07;

  function isLocked() {
    return !!(lock && typeof lock.isLocked === 'function' && lock.isLocked());
  }

  function isInteractionEnabled() {
    return interactionEnabled;
  }

  function setInteractionEnabled(enabled) {
    interactionEnabled = enabled !== false;
  }

  function update(dt) {
    const doorPivot = door.pivot;
    const playerPos = player.getPosition();
    const playerNoclip = !!(player.isNoclipEnabled && player.isNoclipEnabled());
    doorPivot.getWorldPosition(pivotWorldPos);
    doorPivot.getWorldQuaternion(tempQuat);
    invQuat.copy(tempQuat).invert();

    // Player position in door-local space (x = normal axis, z = along door width from hinge)
    localPos.copy(playerPos).sub(pivotWorldPos).applyQuaternion(invQuat);

    const inZ = localPos.z > -0.05 && localPos.z < door.width + 0.05;
    const inY = localPos.y > 0 && localPos.y < door.height;
    const distFromPlane = localPos.x;

    // World-space door normal
    doorNormalWorld.set(1, 0, 0).applyQuaternion(tempQuat);

    if (lock && typeof lock.update === 'function') {
      lock.update(playerPos, getHeldItemType());
    }

    const locked = isLocked();
    if (!locked && !interactionEnabled && lock) {
      interactionEnabled = true;
    }
    const swingEnabled = interactionEnabled && !locked;

    // --- Viewmodel interaction blend (hands-up pose) ---
    let targetBlend = 0;
    if (swingEnabled && inZ && inY && Math.abs(distFromPlane) < 0.9 && camera) {
      camera.getWorldDirection(tempVec);
      const facing = Math.abs(tempVec.dot(doorNormalWorld));
      const proximity = Math.max(0, (0.9 - Math.abs(distFromPlane)) / 0.9);
      targetBlend = proximity * facing;
    }
    const blendRate = targetBlend > interactionBlend ? 8.0 : 5.0;
    interactionBlend += (targetBlend - interactionBlend) * Math.min(1, blendRate * dt);
    if (targetBlend < 0.01 && interactionBlend < 0.015) interactionBlend = 0;

    if (!swingEnabled) {
      angle = 0;
      angularVelocity = 0;
      doorPivot.rotation.y = 0;
      lastPlayerPos.copy(playerPos);
      hasLastPos = true;
      return;
    }

    // --- Contact-based push (physical torque model) ---
    if (!playerNoclip && inZ && inY && Math.abs(distFromPlane) < PUSH_DETECT) {
      const side = distFromPlane >= 0 ? 1 : -1;
      const penetration = Math.max(0, PUSH_DETECT - Math.abs(distFromPlane));

      // Lever arm: where the player contacts along the door (z in local space)
      const leverArm = Math.max(0.05, Math.min(localPos.z, door.width));

      // Player velocity component toward the door plane
      const vel = player.getVelocity ? player.getVelocity() : tempVec.set(0, 0, 0);
      localVel.copy(vel).applyQuaternion(invQuat);
      const velToward = Math.max(0, -localVel.x * side);

      // Contact force — moderate spring, door has real weight
      const contactForce = penetration * CONTACT_FORCE_PENETRATION + velToward * CONTACT_FORCE_VELOCITY;

      // Torque about hinge = force × lever arm
      const torque = contactForce * leverArm;
      angularVelocity += (-side) * (torque / DOOR_I) * dt;
    }

    // --- Auto-close spring (barely perceptible creep back) ---
    angularVelocity += -angle * AUTO_CLOSE_SPRING * dt;
    angularVelocity *= AUTO_CLOSE_DAMPING;

    // --- Air cushion near closed position ---
    // Only brakes BEFORE the door crosses zero (not after overshoot).
    // "approaching closed" = angle and velocity have opposite signs (heading toward 0)
    // AND the door hasn't yet crossed zero (we track the previous angle to detect this).
    const approachingFrame = (angle > 0.005 && angularVelocity < -0.0001)
                          || (angle < -0.005 && angularVelocity > 0.0001);
    if (approachingFrame && Math.abs(angle) < PRE_FRAME_CUSHION_ZONE) {
      const closeness = 1 - Math.abs(angle) / PRE_FRAME_CUSHION_ZONE;
      // Keep a bit of cushion without pulling too hard into the frame.
      const cushionDamp = Math.pow(0.88, closeness);
      angularVelocity *= cushionDamp;
    }

    // Add frame friction around and just past the closed position.
    if (Math.abs(angle) < CROSS_FRAME_FRICTION_ZONE) {
      const closeness = 1 - Math.abs(angle) / CROSS_FRAME_FRICTION_ZONE;
      const friction = 1 - (0.03 + 0.10 * closeness) * Math.min(1, dt * 60);
      angularVelocity *= Math.max(0.82, friction);
    }

    const prevAngle = angle;

    angle += angularVelocity;

    // Dampen overshoot immediately after crossing the frame.
    if (prevAngle !== 0 && Math.sign(prevAngle) !== Math.sign(angle)) {
      angularVelocity *= 0.78;
    }

    // Snap to fully closed only when truly at rest
    if (Math.abs(angle) < 0.001 && Math.abs(angularVelocity) < 0.0001) {
      angle = 0;
      angularVelocity = 0;
    }

    const maxAngle = Math.PI * 0.65;
    if (angle > maxAngle) { angle = maxAngle; angularVelocity *= -0.15; }
    if (angle < -maxAngle) { angle = -maxAngle; angularVelocity *= -0.15; }

    doorPivot.rotation.y = angle;

    lastPlayerPos.copy(playerPos);
    hasLastPos = true;
  }

  /** Resolve player overlap with the door panel (call after player.update). */
  function applyPlayerPushback(playerRef) {
    if (playerRef.isNoclipEnabled && playerRef.isNoclipEnabled()) return;

    const doorPivot = door.pivot;
    const pos = playerRef.getPosition();
    doorPivot.getWorldPosition(pivotWorldPos);
    doorPivot.getWorldQuaternion(tempQuat);
    invQuat.copy(tempQuat).invert();

    const lp = tempVec.copy(pos).sub(pivotWorldPos).applyQuaternion(invQuat);

    const inZ = lp.z > 0.05 && lp.z < door.width - 0.05;
    const inY = lp.y > 0 && lp.y < door.height;

    if (inZ && inY && Math.abs(lp.x) < CONTACT_DIST) {
      const side = lp.x >= 0 ? 1 : -1;
      const pen = CONTACT_DIST - Math.abs(lp.x);
      pushNormal.set(1, 0, 0).applyQuaternion(tempQuat);
      pos.addScaledVector(pushNormal, side * pen);
    }
  }

  function getInteraction() {
    return {
      doorBlend: interactionBlend,
      doorNormal: doorNormalWorld.clone(),
      doorAngle: angle,
      doorAngularVel: angularVelocity,
      locked: isLocked(),
      interactionEnabled: isInteractionEnabled(),
      swingEnabled: isInteractionEnabled() && !isLocked(),
    };
  }

  function resetToClosed() {
    angle = 0;
    angularVelocity = 0;
    interactionBlend = 0;
    door.pivot.rotation.y = 0;
  }

  /** Apply an external torque (e.g. from a shockwave). Units: N·m */
  function applyExternalTorque(torque) {
    const swingEnabled = interactionEnabled && !isLocked();
    if (!swingEnabled) return;
    angularVelocity += torque / DOOR_I;
  }

  return {
    update,
    getInteraction,
    applyPlayerPushback,
    resetToClosed,
    setInteractionEnabled,
    isInteractionEnabled,
    applyExternalTorque,
  };
}
