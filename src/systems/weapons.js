// ─── Weapons System ────────────────────────────────────────────────────────
// Factory function for gun state and mechanics.
// Features:
//  - 9-round magazine (real bullets)
//  - Fire-rate cooldown (0.75s between shots)
//  - Reload discards remaining magazine contents (real bullet loss)
//  - Single ammo type per magazine (no mixed rounds)
//  - Hitscan raycast from camera

import * as THREE from 'three';
import { raycast } from './physics.js';
import { HANDGUN_AMMO_ITEM_IDS } from './itemRegistry.js';

const MAG_CAPACITY = 9;
const FIRE_RATE = 0.82; // seconds between shots
const RELOAD_DURATION = 1.2; // seconds
const SHOCKWAVE_MUZZLE_OFFSET = new THREE.Vector3(0.07, -0.055, -0.33);
const SUPPORTED_AMMO_TYPES = new Set(HANDGUN_AMMO_ITEM_IDS);

export function createGun(inventory, physicsWorld, camera) {
  let currentMag = 0; // Start empty — player must find ammo
  let fireRateCooldown = 0; // Current cooldown timer
  let reloadTimer = 0; // Current reload timer (0 = not reloading)
  let selectedAmmoItemType = 'ammo'; // Ammo item selected for the next reload
  let loadedMagAmmoItemType = 'ammo'; // Ammo type currently in magazine

  function isSupportedAmmoItemType(ammoItemType) {
    return SUPPORTED_AMMO_TYPES.has(ammoItemType);
  }

  return {
    // Attempt to fire. Returns { success, hitInfo }.
    fire() {
      // Can't fire if reloading or fire rate cooldown active
      if (reloadTimer > 0 || fireRateCooldown > 0) {
        return { success: false };
      }

      // Can't fire if magazine is empty
      if (currentMag <= 0) {
        return { success: false };
      }

      // Consume one bullet from magazine
      currentMag -= 1;
      fireRateCooldown = FIRE_RATE;

      // Perform hitscan raycast from camera (world space, camera is parented to player body)
      const rayFrom = new THREE.Vector3();
      camera.getWorldPosition(rayFrom);
      const rayDir = new THREE.Vector3(0, 0, -1);
      camera.getWorldDirection(rayDir);
      const rayTo = rayFrom.clone().addScaledVector(rayDir, 100); // 100m range
      const shockwaveOrigin = SHOCKWAVE_MUZZLE_OFFSET.clone().applyMatrix4(camera.matrixWorld);

      const hitInfo = raycast(physicsWorld, rayFrom, rayTo);

      return {
        success: true,
        hitInfo,
        shockwaveOrigin,
        shockwaveDirection: rayDir,
        ammoItemType: loadedMagAmmoItemType,
      };
    },

    // Initiate reload. Discards remaining magazine ammo.
    reload() {
      // Can't reload if already reloading
      if (reloadTimer > 0) {
        return false;
      }

      // Check if we have ammo in reserve
      const reserveAmmo = inventory.getItemCount(selectedAmmoItemType);
      if (reserveAmmo <= 0) {
        return false;
      }

      // Discard current magazine contents
      currentMag = 0;
      loadedMagAmmoItemType = null;

      // Start reload timer
      reloadTimer = RELOAD_DURATION;
      return true;
    },

    // Update gun state (called each frame)
    update(dt) {
      // Tick down fire rate cooldown
      if (fireRateCooldown > 0) {
        fireRateCooldown -= dt;
      }

      // Handle reload completion
      if (reloadTimer > 0) {
        reloadTimer -= dt;

        if (reloadTimer <= 0) {
          // Reload finished: refill magazine from reserve
          const reserveAmmo = inventory.getItemCount(selectedAmmoItemType);
          const ammoNeeded = MAG_CAPACITY - currentMag;
          const ammoToPull = Math.min(ammoNeeded, reserveAmmo);

          inventory.removeItem(selectedAmmoItemType, ammoToPull);
          currentMag += ammoToPull;
          loadedMagAmmoItemType = ammoToPull > 0 ? selectedAmmoItemType : loadedMagAmmoItemType;
          reloadTimer = 0;
        }
      }
    },

    // Query: Can we fire right now?
    canFire() {
      return currentMag > 0 && fireRateCooldown <= 0 && reloadTimer <= 0;
    },

    // Query: Are we currently reloading?
    isReloading() {
      return reloadTimer > 0;
    },

    // Select which ammo item type should be used on the next reload.
    setSelectedAmmoType(ammoItemType) {
      if (reloadTimer > 0) return false;
      if (!isSupportedAmmoItemType(ammoItemType)) return false;
      selectedAmmoItemType = ammoItemType;
      return true;
    },

    // Combine ammo stack with handgun. Handles opposite-ammo ejection atomically.
    combineAmmoType(ammoItemType) {
      if (!isSupportedAmmoItemType(ammoItemType)) {
        return { success: false, reason: 'invalid-ammo' };
      }
      if (reloadTimer > 0) {
        return { success: false, reason: 'reloading' };
      }

      const needsEject =
        currentMag > 0 &&
        loadedMagAmmoItemType &&
        loadedMagAmmoItemType !== ammoItemType;

      if (needsEject) {
        if (typeof inventory.canFitItem !== 'function') {
          return { success: false, reason: 'inventory-capacity-unsupported' };
        }
        if (!inventory.canFitItem(loadedMagAmmoItemType, currentMag)) {
          return { success: false, reason: 'no-space-for-ejected-rounds' };
        }
      }

      let ejected = 0;
      if (needsEject) {
        const ejectedType = loadedMagAmmoItemType;
        const ejectedQty = currentMag;
        const added = inventory.addItem(ejectedType, ejectedQty);
        if (!added) {
          return { success: false, reason: 'no-space-for-ejected-rounds' };
        }
        currentMag = 0;
        loadedMagAmmoItemType = null;
        ejected = ejectedQty;
      }

      selectedAmmoItemType = ammoItemType;

      const ammoNeeded = Math.max(0, MAG_CAPACITY - currentMag);
      let loaded = 0;

      if (ammoNeeded > 0) {
        const reserveAmmo = inventory.getItemCount(selectedAmmoItemType);
        const ammoToPull = Math.min(ammoNeeded, reserveAmmo);
        if (ammoToPull > 0) {
          loaded = inventory.removeItem(selectedAmmoItemType, ammoToPull);
          currentMag += loaded;
          if (loaded > 0) {
            loadedMagAmmoItemType = selectedAmmoItemType;
          }
        }
      }

      if (currentMag === 0) {
        loadedMagAmmoItemType = null;
      }

      return {
        success: true,
        ejected,
        loaded,
        selectedAmmoItemType,
        loadedMagAmmoItemType,
        currentMag,
      };
    },

    getSelectedAmmoType() {
      return selectedAmmoItemType;
    },

    // Query: Get current ammo state
    getAmmoState() {
      return {
        currentMag,
        reserve: inventory.getItemCount(selectedAmmoItemType),
        isReloading: reloadTimer > 0,
        reloadProgress: reloadTimer > 0 ? (RELOAD_DURATION - reloadTimer) / RELOAD_DURATION : 0,
        isFiring: fireRateCooldown > 0,
        selectedAmmoItemType,
        loadedMagAmmoItemType,
      };
    },

    // Debug
    debug() {
      console.log(`Magazine: ${currentMag}/${MAG_CAPACITY} (${loadedMagAmmoItemType || 'empty'}), Reserve(${selectedAmmoItemType}): ${inventory.getItemCount(selectedAmmoItemType)}, Reloading: ${reloadTimer > 0}`);
    },
  };
}
