// ─── Weapons System ────────────────────────────────────────────────────────
// Factory function for gun state and mechanics.
// Features:
//  - 9-round magazine (real bullets)
//  - Fire-rate cooldown (0.1s between shots)
//  - Reload discards remaining magazine contents (real bullet loss)
//  - Hitscan raycast from camera

import * as THREE from 'three';
import { raycast } from './physics.js';

const MAG_CAPACITY = 9;
const FIRE_RATE = 0.1; // seconds between shots
const RELOAD_DURATION = 1.2; // seconds

export function createGun(inventory, physicsWorld, camera) {
  let currentMag = MAG_CAPACITY; // Start with full magazine
  let fireRateCooldown = 0; // Current cooldown timer
  let reloadTimer = 0; // Current reload timer (0 = not reloading)

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

      // Perform hitscan raycast from camera
      const rayFrom = camera.position.clone();
      const rayDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const rayTo = rayFrom.clone().addScaledVector(rayDir, 100); // 100m range

      const hitInfo = raycast(physicsWorld, rayFrom, rayTo);

      return { success: true, hitInfo };
    },

    // Initiate reload. Discards remaining magazine ammo.
    reload() {
      // Can't reload if already reloading
      if (reloadTimer > 0) {
        return false;
      }

      // Check if we have ammo in reserve
      const reserveAmmo = inventory.getItemCount('ammo');
      if (reserveAmmo <= 0) {
        return false;
      }

      // Discard current magazine contents
      const discarded = currentMag;
      currentMag = 0;

      // Start reload timer
      reloadTimer = RELOAD_DURATION;

      console.log(`[Gun] Reloading... (discarded ${discarded} bullets)`);
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
          const reserveAmmo = inventory.getItemCount('ammo');
          const ammoNeeded = MAG_CAPACITY - currentMag;
          const ammoToPull = Math.min(ammoNeeded, reserveAmmo);

          inventory.removeItem('ammo', ammoToPull);
          currentMag += ammoToPull;

          console.log(`[Gun] Reload complete. Magazine: ${currentMag}/${MAG_CAPACITY}, Reserve: ${inventory.getItemCount('ammo')}`);
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

    // Query: Get current ammo state
    getAmmoState() {
      return {
        currentMag,
        reserve: inventory.getItemCount('ammo'),
        isReloading: reloadTimer > 0,
        reloadProgress: reloadTimer > 0 ? (RELOAD_DURATION - reloadTimer) / RELOAD_DURATION : 0,
        isFiring: fireRateCooldown > 0,
      };
    },

    // Debug
    debug() {
      console.log(`Magazine: ${currentMag}/${MAG_CAPACITY}, Reserve: ${inventory.getItemCount('ammo')}, Reloading: ${reloadTimer > 0}`);
    },
  };
}
