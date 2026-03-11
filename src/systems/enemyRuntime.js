import * as THREE from 'three';

/**
 * Lightweight enemy runtime orchestrator.
 * Owns per-frame controller updates, animation state plumbing, collider sync,
 * and movement application (AI desiredVelocity + knockback + world collision).
 */
export function createEnemyRuntime(world, player, options = {}) {
  const scratchPlayerPos = new THREE.Vector3();

  // Max distance an enemy can move in a single frame (prevents wall tunneling).
  // Thinnest world collider is ~0.2m; half that = safe max step.
  const MAX_STEP = 0.1;

  let enemyAI = options.enemyAI || null;

  function setEnemyAI(ai) {
    enemyAI = ai;
  }

  function getEnemies() {
    if (world.getEnemies) return world.getEnemies();
    if (Array.isArray(world.enemies)) return world.enemies;
    return [];
  }

  /**
   * Slide enemy position along world colliders (simple AABB pushback).
   * Keeps enemies from walking through walls and furniture.
   * Re-computes bounds after each pushback to handle adjacent colliders.
   */
  function applyWorldCollision(enemy) {
    const col = enemy.components.collision;
    if (!col || !col.box) return;

    const colliders = world.colliders;
    if (!colliders || colliders.length === 0) return;

    const pos = enemy.mesh.position;
    const hs = col.halfSize;
    const footY = col.footOffsetY || 0;

    for (let i = 0; i < colliders.length; i++) {
      const box = colliders[i];
      if (box === col.box) continue;

      const bMin = box.min;
      const bMax = box.max;

      // Recompute enemy AABB each iteration (pos may have shifted)
      const eMinX = pos.x - hs.x;
      const eMaxX = pos.x + hs.x;
      const eMinY = footY;
      const eMaxY = footY + hs.y * 2;
      const eMinZ = pos.z - hs.z;
      const eMaxZ = pos.z + hs.z;

      // AABB overlap test
      if (
        eMinX >= bMax.x || eMaxX <= bMin.x ||
        eMinY >= bMax.y || eMaxY <= bMin.y ||
        eMinZ >= bMax.z || eMaxZ <= bMin.z
      ) continue;

      // Compute smallest pushback axis
      const overlapX1 = eMaxX - bMin.x;
      const overlapX2 = bMax.x - eMinX;
      const overlapZ1 = eMaxZ - bMin.z;
      const overlapZ2 = bMax.z - eMinZ;

      const minOverlapX = Math.min(overlapX1, overlapX2);
      const minOverlapZ = Math.min(overlapZ1, overlapZ2);

      if (minOverlapX < minOverlapZ) {
        pos.x += overlapX1 < overlapX2 ? -overlapX1 : overlapX2;
      } else {
        pos.z += overlapZ1 < overlapZ2 ? -overlapZ1 : overlapZ2;
      }
    }
  }

  function update(dt) {
    const enemies = getEnemies();
    if (!enemies || enemies.length === 0) return;

    if (player && player.getPosition) {
      scratchPlayerPos.copy(player.getPosition());
    }

    // Let AI system run its decision-making pass
    if (enemyAI) {
      enemyAI.update(dt, scratchPlayerPos);
    }

    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      if (!enemy || !enemy.components) continue;

      const { controller, animation, collision, pathing } = enemy.components;

      // Death state — visual collapse so dead enemies don't look "stuck"
      const health = enemy.components.health;
      if (health && health.dead) {
        if (animation && animation.state !== 'death') {
          animation.state = 'death';
        }
        // Collapse: tilt forward and sink into ground over time
        if (!enemy.state._deathTimer) enemy.state._deathTimer = 0;
        enemy.state._deathTimer += dt;
        const t = Math.min(enemy.state._deathTimer / 0.6, 1); // 0.6s collapse
        enemy.mesh.rotation.x = t * (Math.PI / 2) * 0.85; // face-plant ~76°
        enemy.mesh.position.y = -t * 0.4; // sink slightly
        if (t >= 1) {
          // Fully collapsed — disable knockback so corpse stops reacting
          if (kb) kb.active = false;
        }
      }

      // Legacy controller hook (idle bob, etc.)
      if (controller && typeof controller.update === 'function') {
        controller.update(dt, {
          enemy,
          playerPosition: scratchPlayerPos,
          world,
        });
      }

      // Process shockwave knockback
      const kb = enemy.components.knockback;
      const isKnockedBack = kb && kb.active;

      if (isKnockedBack) {
        // During knockback: only physics impulse moves the enemy, AI steering is suppressed.
        // Sub-step the displacement to prevent tunneling through thin colliders.
        const speed = kb.velocity.length();
        const rawStep = speed * dt;

        if (rawStep > MAX_STEP) {
          // Break into sub-steps
          const steps = Math.ceil(rawStep / MAX_STEP);
          const subDt = dt / steps;
          for (let s = 0; s < steps; s++) {
            enemy.mesh.position.addScaledVector(kb.velocity, subDt);
            // Keep on ground plane
            enemy.mesh.position.y = Math.max(0, enemy.mesh.position.y);
            applyWorldCollision(enemy);
          }
        } else {
          enemy.mesh.position.addScaledVector(kb.velocity, dt);
          enemy.mesh.position.y = Math.max(0, enemy.mesh.position.y);
          applyWorldCollision(enemy);
        }

        kb.velocity.multiplyScalar(Math.pow(0.1, dt)); // exponential friction decay
        // Kill Y velocity so enemies don't float
        kb.velocity.y *= 0.5;

        if (kb.velocity.lengthSq() < 0.01) {
          kb.active = false;
          // Snap Y back to ground after knockback ends
          enemy.mesh.position.y = 0;
          // Notify AI to immediately re-evaluate
          if (enemyAI) {
            enemyAI.notifyKnockbackEnd(enemy);
          }
        }
      } else if (pathing && !enemy.components.health?.dead) {
        // Normal AI-driven movement (only when NOT knocked back)
        const vel = pathing.desiredVelocity;
        if (vel.lengthSq() > 0.0001) {
          enemy.mesh.position.addScaledVector(vel, dt);

          // Update animation state based on pathing mode
          if (animation && animation.state !== 'death' && animation.state !== 'hit') {
            animation.state = 'walk';
          }
        } else {
          if (animation && animation.state === 'walk') {
            animation.state = 'idle';
          }
        }
      }

      // World collision (runs after AI movement; knockback path handles its own)
      if (!isKnockedBack) {
        applyWorldCollision(enemy);
      }

      if (collision && typeof collision.syncFromEntity === 'function') {
        collision.syncFromEntity(enemy);
      }
    }
  }

  return {
    update,
    setEnemyAI,
  };
}
