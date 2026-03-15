import * as THREE from 'three';
import { makeKeyItemId } from './itemRegistry.js';

export function createLock({
  id = 'lock',
  requiredKeyId,
  position = new THREE.Vector3(),
  unlockRadius = 1.25,
  verticalTolerance = 1.5,
  startsLocked = true,
  onUnlock = null,
} = {}) {
  if (!requiredKeyId) {
    throw new Error('createLock requires a requiredKeyId');
  }

  const requiredItemType = makeKeyItemId(requiredKeyId);
  if (!requiredItemType) {
    throw new Error('createLock could not build a key item id from requiredKeyId');
  }

  const lockPosition = position instanceof THREE.Vector3
    ? position.clone()
    : new THREE.Vector3(position.x || 0, position.y || 0, position.z || 0);

  let locked = startsLocked !== false;

  function isVectorLike(value) {
    return !!value
      && Number.isFinite(value.x)
      && Number.isFinite(value.y)
      && Number.isFinite(value.z);
  }

  function isActorInRange(actorPosition) {
    if (!isVectorLike(actorPosition)) return false;
    const dx = actorPosition.x - lockPosition.x;
    const dy = actorPosition.y - lockPosition.y;
    const dz = actorPosition.z - lockPosition.z;

    // Range is cylindrical: horizontal radius + vertical band.
    // This keeps multi-floor spaces from unlocking through ceilings/floors.
    const horizontalDistSq = dx * dx + dz * dz;
    if (horizontalDistSq > unlockRadius * unlockRadius) return false;
    return Math.abs(dy) <= verticalTolerance;
  }

  function unlock(options = {}) {
    if (!locked) return false;
    locked = false;
    if (options.notify !== false && typeof onUnlock === 'function') {
      onUnlock({ id, requiredKeyId, requiredItemType, position: lockPosition.clone() });
    }
    return true;
  }

  function tryUnlock(actorPosition, heldItemType) {
    if (!locked) return false;
    if (heldItemType !== requiredItemType) return false;
    if (!isActorInRange(actorPosition)) return false;
    return unlock();
  }

  function update(actorPosition, heldItemType) {
    return tryUnlock(actorPosition, heldItemType);
  }

  function setPosition(nextPosition) {
    if (!nextPosition) return;
    lockPosition.set(
      Number.isFinite(nextPosition.x) ? nextPosition.x : lockPosition.x,
      Number.isFinite(nextPosition.y) ? nextPosition.y : lockPosition.y,
      Number.isFinite(nextPosition.z) ? nextPosition.z : lockPosition.z
    );
  }

  function getPosition(target = new THREE.Vector3()) {
    return target.copy(lockPosition);
  }

  return {
    id,
    requiredKeyId,
    requiredItemType,
    unlockRadius,
    verticalTolerance,
    isLocked: () => locked,
    isActorInRange,
    tryUnlock,
    update,
    unlock,
    lock: () => { locked = true; },
    setPosition,
    getPosition,
  };
}
