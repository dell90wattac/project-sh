// ─── Shockwave System ─────────────────────────────────────────────────────────
// Central system for shockwave generation, force distribution, and furniture shake.
// Uses a target registry so doors/chandeliers/enemies/debris register themselves
// without the shockwave system importing their modules.

import * as THREE from 'three';

const _toTarget = new THREE.Vector3();
const _forceDir = new THREE.Vector3();

export function createShockwaveSystem() {
  const targets = [];       // registered shockwave-affected objects
  const activeShakes = [];  // currently shaking furniture

  // ─── Target Registry ────────────────────────────────────────────────────

  /**
   * Register an object that reacts to shockwaves.
   * @param {string} type - 'door' | 'chandelier' | 'enemy' | 'shakeable' | 'debris' | 'pickup'
   * @param {object} target
   * @param {() => THREE.Vector3} target.getPosition - returns world position
   * @param {(forceDir: THREE.Vector3, magnitude: number) => void} target.applyForce
   * @param {((amount: number) => void)|undefined} target.takeDamage - optional, for enemies
   */
  function registerTarget(type, target) {
    targets.push({ type, ...target });
  }

  /**
   * Remove all targets of a given type (useful when enemies die or items are picked up).
   */
  function removeTargetsByRef(ref) {
    for (let i = targets.length - 1; i >= 0; i--) {
      if (targets[i]._ref === ref) {
        targets.splice(i, 1);
      }
    }
  }

  // ─── Shockwave Fire ─────────────────────────────────────────────────────

  /**
   * Fire a shockwave from the given origin in the given direction.
   * @param {THREE.Vector3} origin - world-space origin (gun barrel position)
   * @param {THREE.Vector3} direction - normalized fire direction
   * @param {object} ammoConfig - ammo type config from ammoTypes.js
   */
  function fire(origin, direction, ammoConfig) {
    const { radius, force, damage, falloffExponent, shape, coneHalfAngle, splashForceMult } = ammoConfig;
    const cosHalfAngle = Math.cos(coneHalfAngle || 0);
    let hitCount = 0;
    const hits = [];

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      const targetPos = target.getPosition();

      _toTarget.subVectors(targetPos, origin);
      const dist = _toTarget.length();

      // Skip if out of range
      if (dist > radius || dist < 0.01) continue;

      // Normalize direction to target
      _forceDir.copy(_toTarget).divideScalar(dist);

      // Check if target is within the shockwave shape
      let forceMult = 1;

      if (shape === 'cone') {
        const dot = direction.dot(_forceDir);
        if (dot < cosHalfAngle) continue; // outside cone
      } else if (shape === 'hybrid') {
        const dot = direction.dot(_forceDir);
        if (dot < cosHalfAngle) {
          // Outside cone but within sphere — apply reduced splash
          forceMult = splashForceMult || 0;
          if (forceMult <= 0) continue;
        }
      }
      // shape === 'sphere' always passes

      // Compute force with distance falloff
      const normalizedDist = dist / radius;
      const falloff = Math.pow(1 - normalizedDist, falloffExponent);
      const magnitude = force * falloff * forceMult;

      if (magnitude < 0.01) continue;

      // Apply force
      target.applyForce(_forceDir, magnitude, {
        ammoConfig,
        distance: dist,
        radius,
        falloff,
        forceMult,
      });
      hitCount++;
      hits.push({
        type: target.type,
        targetRef: target,
        position: new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z),
        distance: dist,
        magnitude,
        falloff,
        forceMult,
      });

      // Apply damage to damageable targets
      if (target.takeDamage) {
        const dmg = damage * falloff * forceMult;
        if (dmg > 0.01) {
          target.takeDamage(dmg);
        }
      }
    }

    return { hitCount, hits };
  }

  // ─── Furniture Shake (Canned Rattle) ────────────────────────────────────

  /**
   * Start a rattle animation on a mesh.
   * @param {THREE.Mesh} mesh
   * @param {number} intensity - 0..1+ scale factor
   */
  function shakeObject(mesh, intensity) {
    // Check if this mesh is already shaking — if so, reset it
    for (let i = 0; i < activeShakes.length; i++) {
      if (activeShakes[i].mesh === mesh) {
        activeShakes[i].elapsed = 0;
        activeShakes[i].intensity = Math.max(activeShakes[i].intensity, intensity);
        return;
      }
    }

    activeShakes.push({
      mesh,
      originalX: mesh.position.x,
      originalZ: mesh.position.z,
      intensity: Math.min(intensity, 2),
      elapsed: 0,
      duration: 0.2 + intensity * 0.15,
    });
  }

  /**
   * Per-frame update for active shake animations.
   */
  function update(dt) {
    for (let i = activeShakes.length - 1; i >= 0; i--) {
      const s = activeShakes[i];
      s.elapsed += dt;

      if (s.elapsed >= s.duration) {
        // Restore original position and remove
        s.mesh.position.x = s.originalX;
        s.mesh.position.z = s.originalZ;
        activeShakes.splice(i, 1);
        continue;
      }

      const t = s.elapsed / s.duration;
      const decay = 1 - t;
      const amp = s.intensity * decay * 0.05;
      const freq = 25;

      s.mesh.position.x = s.originalX + Math.sin(t * freq) * amp;
      s.mesh.position.z = s.originalZ + Math.cos(t * freq * 0.7) * amp * 0.75;
    }
  }

  return {
    registerTarget,
    removeTargetsByRef,
    fire,
    shakeObject,
    update,
  };
}
