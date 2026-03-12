import * as THREE from 'three';

/**
 * Lightweight enemy runtime orchestrator.
 * Owns per-frame controller updates, animation state plumbing, collider sync,
 * and movement application (AI desiredVelocity + knockback + world collision).
 *
 * Spider-specific locomotion:
 *   - surface.normal tracks current contact surface (floor / wall / ceiling)
 *   - On collision contact the push axis becomes the new surface normal and
 *     the spider's orientation snaps to align with it (no blend).
 *   - Movement is projected onto the tangent plane of surface.normal so the
 *     spider slides along whatever surface it's on.
 *   - Shockwave knockback launches spiders into a 3D arc (gravity applied).
 *     On collision landing they re-adhere to the struck surface.
 */
export function createEnemyRuntime(world, player, options = {}) {
  const scratchPlayerPos = new THREE.Vector3();

  // Max distance an enemy can move in a single sub-step (prevents wall tunneling).
  const MAX_STEP = 0.1;
  // Spiders use a tighter step — their collision box is small (halfSize 0.13)
  // so 0.1 can push them past a wall's center, causing wrong-side resolution.
  const SPIDER_MAX_STEP = 0.04;

  // Spider gravity constant (m/s² downward while airborne)
  const SPIDER_GRAVITY = 9.8;

  // After this many seconds airborne with no landing, safety-reset to floor
  const SPIDER_AIRBORNE_TIMEOUT = 5.0;
  const SPIDER_CLIMB_ASSIST_TIME = 0.45;
  const SPIDER_CONTACT_LOSS_TIME = 0.35;
  const SPIDER_ADHESION_PRESS = 0.06;

  let enemyAI = options.enemyAI || null;

  // Scratch vectors for spider surface math (avoids per-frame allocation)
  const _up      = new THREE.Vector3();
  const _forward = new THREE.Vector3();
  const _right2  = new THREE.Vector3();
  const _proj    = new THREE.Vector3();
  const _pushDir = new THREE.Vector3();
  const _tmpDir  = new THREE.Vector3();
  const _tmpN    = new THREE.Vector3();
  const _prevN   = new THREE.Vector3();
  const _qTarget = new THREE.Quaternion();
  const _qWorld  = new THREE.Quaternion(0, 0, 0, 1); // identity — world up
  const _qAlign  = new THREE.Quaternion();
  const _rotMat  = new THREE.Matrix4();

  function setEnemyAI(ai) {
    enemyAI = ai;
  }

  function getEnemies() {
    if (world.getEnemies) return world.getEnemies();
    if (Array.isArray(world.enemies)) return world.enemies;
    return [];
  }

  // ── Standard AABB world collision (used by zombies + spider ground phase) ──

  /**
   * Slide enemy position along world colliders (simple AABB pushback).
   * Returns false; for spider use applyWorldCollisionSpider which also
   * captures the contact normal.
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
      // Spiders should crawl over world geometry, not be blocked by other enemies.
      if (box._enemyCollider && box._enemyEntity && box._enemyEntity !== enemy) continue;

      const bMin = box.min;
      const bMax = box.max;

      const eMinX = pos.x - hs.x;
      const eMaxX = pos.x + hs.x;
      const eMinY = footY;
      const eMaxY = footY + hs.y * 2;
      const eMinZ = pos.z - hs.z;
      const eMaxZ = pos.z + hs.z;

      if (
        eMinX >= bMax.x || eMaxX <= bMin.x ||
        eMinY >= bMax.y || eMaxY <= bMin.y ||
        eMinZ >= bMax.z || eMaxZ <= bMin.z
      ) continue;

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

  // ── Spider surface collision — full 3D, captures contact normal ───────────

  /**
   * Like applyWorldCollision but:
   *  - Treats the Y axis as a live dimension (no footY floor lock).
   *  - Resolves the smallest-overlap axis across X, Y, and Z.
   *  - Returns the outward normal of the first resolved contact, or null.
   * Spider uses this to derive which surface it just touched.
   */
  function scoreSpiderContactNormal(normal, preferredDir, pushAmount) {
    // Base score prefers stronger pushback (deeper contact).
    let score = pushAmount;

    if (preferredDir && preferredDir.lengthSq() > 0.0001) {
      _tmpDir.copy(preferredDir).normalize();
      // Prefer normals that oppose movement direction (what we actually hit).
      score += Math.max(0, -normal.dot(_tmpDir)) * 2.25;

      // Contextual bias:
      // - While climbing upward, prefer upward-facing normals so spiders can
      //   transition from wall faces onto tops of desks/tables.
      // - While mostly horizontal movement, lightly prefer vertical faces to
      //   initiate climbs when encountering blockers.
      if (_tmpDir.y > 0.25) {
        score += Math.max(0, normal.y) * 1.35;
      } else if (Math.abs(_tmpDir.y) < 0.2) {
        score += (1 - Math.abs(normal.y)) * 0.12;
      }
    }

    return score;
  }

  function applyWorldCollisionSpider(enemy, preferredDir = null) {
    const col = enemy.components.collision;
    if (!col || !col.box) return null;

    const colliders = world.colliders;
    if (!colliders || colliders.length === 0) return null;

    const pos = enemy.mesh.position;
    const hs = col.halfSize;
    const footY = col.footOffsetY || 0;

    let hasContact = false;
    let bestScore = -Infinity;
    const bestNormal = new THREE.Vector3();

    for (let i = 0; i < colliders.length; i++) {
      const box = colliders[i];
      if (box === col.box) continue;

      const bMin = box.min;
      const bMax = box.max;

      // Recompute AABB matching syncFromEntity (full 3D, offset by footY)
      const eMinX = pos.x - hs.x;
      const eMaxX = pos.x + hs.x;
      const eMinY = pos.y + footY;
      const eMaxY = pos.y + footY + hs.y * 2;
      const eMinZ = pos.z - hs.z;
      const eMaxZ = pos.z + hs.z;

      if (
        eMinX >= bMax.x || eMaxX <= bMin.x ||
        eMinY >= bMax.y || eMaxY <= bMin.y ||
        eMinZ >= bMax.z || eMaxZ <= bMin.z
      ) continue;

      // Overlaps on each axis
      const ox1 = eMaxX - bMin.x; // push -X
      const ox2 = bMax.x - eMinX; // push +X
      const oy1 = eMaxY - bMin.y; // push -Y
      const oy2 = bMax.y - eMinY; // push +Y
      const oz1 = eMaxZ - bMin.z; // push -Z
      const oz2 = bMax.z - eMinZ; // push +Z

      const minOX = Math.min(ox1, ox2);
      const minOY = Math.min(oy1, oy2);
      const minOZ = Math.min(oz1, oz2);

      // Resolve smallest overlap axis
      if (minOX <= minOY && minOX <= minOZ) {
        const pushX = ox1 < ox2 ? -ox1 : ox2;
        pos.x += pushX;
        _pushDir.set(Math.sign(pushX), 0, 0);
        const score = scoreSpiderContactNormal(_pushDir, preferredDir, Math.abs(pushX));
        if (score > bestScore) {
          bestScore = score;
          bestNormal.copy(_pushDir);
          hasContact = true;
        }
      } else if (minOY <= minOX && minOY <= minOZ) {
        const pushY = oy1 < oy2 ? -oy1 : oy2;
        pos.y += pushY;
        _pushDir.set(0, Math.sign(pushY), 0);
        const score = scoreSpiderContactNormal(_pushDir, preferredDir, Math.abs(pushY));
        if (score > bestScore) {
          bestScore = score;
          bestNormal.copy(_pushDir);
          hasContact = true;
        }
      } else {
        const pushZ = oz1 < oz2 ? -oz1 : oz2;
        pos.z += pushZ;
        _pushDir.set(0, 0, Math.sign(pushZ));
        const score = scoreSpiderContactNormal(_pushDir, preferredDir, Math.abs(pushZ));
        if (score > bestScore) {
          bestScore = score;
          bestNormal.copy(_pushDir);
          hasContact = true;
        }
      }
    }

    return hasContact ? bestNormal : null;
  }

  function remapSpiderDirectionToSurface(direction, fromNormal, toNormal, outDir) {
    _prevN.copy(fromNormal).normalize();
    _tmpN.copy(toNormal).normalize();

    outDir.copy(direction);
    if (outDir.lengthSq() < 0.0001) {
      outDir.set(0, 0, -1);
    } else {
      outDir.normalize();
    }

    // Rotate previous movement into the new surface frame.
    _qAlign.setFromUnitVectors(_prevN, _tmpN);
    outDir.applyQuaternion(_qAlign);

    // Keep movement tangent to the destination surface.
    outDir.addScaledVector(_tmpN, -outDir.dot(_tmpN));

    if (outDir.lengthSq() < 0.0001) {
      // Fallback: project world-up into surface tangent.
      outDir.set(0, 1, 0).addScaledVector(_tmpN, -_tmpN.y);
      if (outDir.lengthSq() < 0.0001) {
        outDir.set(1, 0, 0).addScaledVector(_tmpN, -_tmpN.x);
      }
    }

    outDir.normalize();

    // On walls, prefer climbing up over diving down.
    if (Math.abs(_tmpN.y) < 0.35 && outDir.y < 0) {
      outDir.multiplyScalar(-1);
    }
  }

  // ── Spider orientation helpers ────────────────────────────────────────────

  /**
   * Snap the spider's mesh quaternion so its local +Y axis aligns with
   * the given surface normal, preserving as much of the current yaw as possible.
   */
  function snapSpiderToSurface(spider, normal) {
    const surf = spider.components.surface;
    surf.normal.copy(normal);

    // Build a rotation: local up → surface normal
    // We need a "forward" reference to prevent gimbal — use the mesh's current
    // world forward (-Z) projected onto the surface tangent plane.
    _up.copy(normal).normalize();

    // Extract current facing direction (local -Z projected to world)
    spider.mesh.updateWorldMatrix(false, false);
    _forward.set(0, 0, -1).applyQuaternion(spider.mesh.quaternion);

    // Project forward onto the surface tangent plane
    _proj.copy(_forward).addScaledVector(_up, -_forward.dot(_up));
    if (_proj.lengthSq() < 0.001) {
      // Degenerate — choose an arbitrary tangent
      _proj.set(1, 0, 0).addScaledVector(_up, -_up.x).normalize();
    } else {
      _proj.normalize();
    }

    // Build orthonormal frame: right = forward × up
    _right2.crossVectors(_proj, _up).normalize();
    // Re-orthonormalise forward from right × up
    _forward.crossVectors(_up, _right2).normalize();

    // Build rotation matrix columns → quaternion
    // Column order: right(X), up(Y), -forward(Z)
    _rotMat.set(
      _right2.x,    _up.x,     _forward.x,  0,
      _right2.y,    _up.y,     _forward.y,  0,
      _right2.z,    _up.z,     _forward.z,  0,
      0,            0,         0,           1
    );
    _qTarget.setFromRotationMatrix(_rotMat);
    spider.mesh.quaternion.copy(_qTarget);
  }

  /**
   * Project a world-space velocity onto the tangent plane of the surface normal.
   * Returns a new Vector3 (does not modify vel).
   */
  function projectOntoSurface(vel, normal) {
    // Remove component along normal: v_tangent = v - (v·n)n
    const dot = vel.dot(normal);
    return vel.clone().addScaledVector(normal, -dot);
  }

  // ── Per-enemy update helpers ──────────────────────────────────────────────

  function updateSpider(enemy, dt, kb, isKnockedBack, pathing, animation, collision) {
    const surf = enemy.components.surface;
    if (!surf.travelDir) {
      surf.travelDir = new THREE.Vector3(0, 1, 0);
    }
    if (typeof surf.climbAssistTimer !== 'number') {
      surf.climbAssistTimer = 0;
    }
    if (typeof surf.noContactTimer !== 'number') {
      surf.noContactTimer = 0;
    }
    if (typeof surf.transitionCooldown !== 'number') {
      surf.transitionCooldown = 0;
    }

    if (isKnockedBack) {
      // ── Airborne arc phase ──────────────────────────────────────────────
      // Apply gravity each frame
      kb.velocity.y -= SPIDER_GRAVITY * dt;

      // Sub-step to avoid tunneling
      const speed = kb.velocity.length();
      const rawStep = speed * dt;
      let contactNormal = null;

      if (rawStep > SPIDER_MAX_STEP) {
        const steps = Math.ceil(rawStep / SPIDER_MAX_STEP);
        const subDt = dt / steps;
        for (let s = 0; s < steps; s++) {
          enemy.mesh.position.addScaledVector(kb.velocity, subDt);
          contactNormal = applyWorldCollisionSpider(enemy, kb.velocity);
          if (contactNormal) break; // landed — stop sub-stepping
        }
      } else {
        enemy.mesh.position.addScaledVector(kb.velocity, dt);
        contactNormal = applyWorldCollisionSpider(enemy, kb.velocity);
      }

      // Light air friction — spiders are small and should fly far before
      // hitting surfaces. 0.55^dt retains ~55% velocity per second (vs zombie
      // 0.1^dt which retains only 10%).
      kb.velocity.multiplyScalar(Math.pow(0.55, dt));

      surf.airborneTimer += dt;

      if (contactNormal) {
        // Landed on a surface — snap and re-adhere
        _prevN.copy(surf.normal);
        const preImpactDir = kb.velocity.lengthSq() > 0.0001
          ? _tmpDir.copy(kb.velocity).normalize()
          : _tmpDir.copy(surf.travelDir).normalize();
        snapSpiderToSurface(enemy, contactNormal);
        remapSpiderDirectionToSurface(preImpactDir, _prevN, surf.normal, surf.travelDir);
        // Push well clear of impact surface. A generous push (larger than
        // halfSize) guarantees the spider's center exits the collider even
        // from a deep embed. Cleanup passes catch any remaining overlaps.
        enemy.mesh.position.addScaledVector(contactNormal, 0.18);
        for (let pass = 0; pass < 5; pass++) {
          if (!applyWorldCollisionSpider(enemy)) break;
        }
        surf.airborne = false;
        surf.airborneTimer = 0;
        surf.noContactTimer = 0;
        surf.transitionCooldown = 0.25;
        surf.climbAssistTimer = Math.abs(surf.normal.y) < 0.35 ? SPIDER_CLIMB_ASSIST_TIME : 0;
        kb.active = false;
        if (enemyAI) enemyAI.notifyKnockbackEnd(enemy);
      } else if (surf.airborneTimer >= SPIDER_AIRBORNE_TIMEOUT) {
        // Safety reset — out of world recovery
        surf.normal.set(0, 1, 0);
        surf.airborne = false;
        surf.airborneTimer = 0;
        surf.noContactTimer = 0;
        surf.climbAssistTimer = 0;
        enemy.mesh.position.y = Math.max(0, enemy.mesh.position.y);
        enemy.mesh.quaternion.copy(_qWorld);
        kb.active = false;
        if (enemyAI) enemyAI.notifyKnockbackEnd(enemy);
      }

    } else if (pathing && !enemy.components.health?.dead) {
      // ── Normal surface-walk phase ───────────────────────────────────────
      const vel = pathing.desiredVelocity;
      surf.climbAssistTimer = Math.max(0, surf.climbAssistTimer - dt);
      surf.transitionCooldown = Math.max(0, surf.transitionCooldown - dt);

      if (vel.lengthSq() > 0.0001) {
        // Project AI velocity onto current surface tangent
        const tangentVel = projectOntoSurface(vel, surf.normal);
        const desiredSpeed = vel.length();
        const onWall = Math.abs(surf.normal.y) < 0.35;
        const pushingIntoSurface = vel.dot(surf.normal) < -0.06;

        const contactDrivenClimb = onWall && pushingIntoSurface && surf.noContactTimer <= 0.0001;

        if (
          onWall &&
          pushingIntoSurface &&
          (surf.climbAssistTimer > 0 || contactDrivenClimb) &&
          surf.travelDir.lengthSq() > 0.0001
        ) {
          // Keep climbing briefly after transition, then hand control back
          // to projected chase direction.
          tangentVel.copy(surf.travelDir).normalize().multiplyScalar(desiredSpeed);
        }

        if (
          desiredSpeed > 0.0001 &&
          tangentVel.lengthSq() < 0.0001 &&
          surf.climbAssistTimer > 0 &&
          surf.travelDir.lengthSq() > 0.0001
        ) {
          tangentVel.copy(surf.travelDir).normalize().multiplyScalar(desiredSpeed);
        }

        // Move spider
        enemy.mesh.position.addScaledVector(tangentVel, dt);

        // Adhesion press: push spider into current surface so collision detects
        // contact. Counteracts the previous frame's contactOffset push-out so the
        // spider maintains wall/ceiling adhesion between frames.
        if (surf.normal.y < 0.9) {
          enemy.mesh.position.addScaledVector(surf.normal, -SPIDER_ADHESION_PRESS);
        }

        // Apply 3D collision — get contact normal if we just hit something
        const contactNormal = applyWorldCollisionSpider(enemy, tangentVel);
        if (contactNormal) {
          // During transition cooldown, collisions still resolve (push-out
          // already happened inside applyWorldCollisionSpider) but we don't
          // re-snap the surface normal. This prevents wall↔floor oscillation
          // at junctions after knockback landings.
          if (surf.transitionCooldown <= 0) {
            // Genuine new surface — snap orientation to it
            _prevN.copy(surf.normal);
            const preContactDir = tangentVel.lengthSq() > 0.0001
              ? _tmpDir.copy(tangentVel).normalize()
              : _tmpDir.copy(surf.travelDir).normalize();
            snapSpiderToSurface(enemy, contactNormal);
            remapSpiderDirectionToSurface(preContactDir, _prevN, surf.normal, surf.travelDir);
            surf.transitionCooldown = 0.15;
            const transitionedToWall = Math.abs(_prevN.y) > 0.65 && Math.abs(surf.normal.y) < 0.35;
            if (transitionedToWall || (Math.abs(surf.normal.y) < 0.35 && pushingIntoSurface)) {
              surf.climbAssistTimer = SPIDER_CLIMB_ASSIST_TIME;
            }
          }
          surf.noContactTimer = 0;
          // Push spider slightly out from surface to avoid next-frame embed
          enemy.mesh.position.addScaledVector(contactNormal, surf.contactOffset);
        } else if (tangentVel.lengthSq() > 0.0001) {
          surf.travelDir.copy(tangentVel).normalize();

          // If we are on a wall/ceiling but no longer making contact, detach
          // and fall instead of "floating" in the sky.
          const onNonFloorSurface = Math.abs(surf.normal.y) < 0.9;
          if (onNonFloorSurface) {
            surf.noContactTimer += dt;
            if (surf.noContactTimer >= SPIDER_CONTACT_LOSS_TIME) {
              surf.airborne = true;
              surf.airborneTimer = 0;
              surf.climbAssistTimer = 0;
              kb.active = true;
              if (kb.velocity.lengthSq() < 0.0001) {
                kb.velocity.copy(surf.travelDir).multiplyScalar(pathing.moveSpeed * 0.35);
              }
              // Start dropping immediately.
              kb.velocity.y -= 0.8;
            }
          } else if (enemy.mesh.position.y > 0.08) {
            // On a floor-like surface but elevated (e.g. walked off a table edge).
            // No collider beneath us — apply gravity so the spider drops down
            // instead of floating in mid-air.
            surf.noContactTimer += dt;
            if (surf.noContactTimer >= SPIDER_CONTACT_LOSS_TIME) {
              surf.airborne = true;
              surf.airborneTimer = 0;
              surf.climbAssistTimer = 0;
              kb.active = true;
              kb.velocity.set(0, 0, 0);
              kb.velocity.y -= 0.8;
            }
          } else {
            surf.noContactTimer = 0;
          }
        }

        if (animation && animation.state !== 'death' && animation.state !== 'hit') {
          animation.state = 'walk';
        }

        // Face the movement direction on the surface tangent
        if (tangentVel.lengthSq() > 0.0001) {
          // For surface orientation we just update the yaw component within
          // the current surface frame by computing the target forward in world
          // space and re-running snapSpiderToSurface with the same normal but
          // updated forward hint.
          _forward.copy(tangentVel).normalize();
          _up.copy(surf.normal);
          _right2.crossVectors(_forward, _up).normalize();
          _forward.crossVectors(_up, _right2).normalize();
          _rotMat.set(
            _right2.x, _up.x, _forward.x, 0,
            _right2.y, _up.y, _forward.y, 0,
            _right2.z, _up.z, _forward.z, 0,
            0,         0,     0,          1
          );
          _qTarget.setFromRotationMatrix(_rotMat);
          enemy.mesh.quaternion.slerp(_qTarget, Math.min(1, enemy.components.pathing.turnSpeed * dt));
        }
      } else {
        if (animation && animation.state === 'walk') {
          animation.state = 'idle';
        }
      }
    }

    // Collider sync
    if (collision && typeof collision.syncFromEntity === 'function') {
      collision.syncFromEntity(enemy);
    }
  }

  // ── Main update loop ──────────────────────────────────────────────────────

  function update(dt) {
    const enemies = getEnemies();
    if (!enemies || enemies.length === 0) return;

    if (player && player.getPosition) {
      scratchPlayerPos.copy(player.getPosition());
    }

    // AI decision pass
    if (enemyAI) {
      enemyAI.update(dt, scratchPlayerPos);
    }

    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      if (!enemy || !enemy.components) continue;

      const { controller, animation, collision, pathing } = enemy.components;

      // Death state — visual collapse (both enemy types)
      const health = enemy.components.health;
      if (health && health.dead) {
        if (animation && animation.state !== 'death') {
          animation.state = 'death';
        }
        if (!enemy.state._deathTimer) enemy.state._deathTimer = 0;
        enemy.state._deathTimer += dt;
        const t = Math.min(enemy.state._deathTimer / 0.6, 1);
        enemy.mesh.rotation.x = t * (Math.PI / 2) * 0.85;
        enemy.mesh.position.y = -t * 0.4;
        if (t >= 1) {
          const kb2 = enemy.components.knockback;
          if (kb2) kb2.active = false;
        }
        continue; // skip movement for dead enemies
      }

      // Controller hook (idle bob, etc.)
      if (controller && typeof controller.update === 'function') {
        controller.update(dt, { enemy, playerPosition: scratchPlayerPos, world });
      }

      const kb = enemy.components.knockback;
      const isKnockedBack = kb && kb.active;

      // ── Spider ──────────────────────────────────────────────────────────
      if (enemy.type === 'spider') {
        updateSpider(enemy, dt, kb, isKnockedBack, pathing, animation, collision);
        continue;
      }

      // ── Standard zombie / other ground enemies ──────────────────────────
      if (isKnockedBack) {
        const speed = kb.velocity.length();
        const rawStep = speed * dt;

        if (rawStep > MAX_STEP) {
          const steps = Math.ceil(rawStep / MAX_STEP);
          const subDt = dt / steps;
          for (let s = 0; s < steps; s++) {
            enemy.mesh.position.addScaledVector(kb.velocity, subDt);
            enemy.mesh.position.y = Math.max(0, enemy.mesh.position.y);
            applyWorldCollision(enemy);
          }
        } else {
          enemy.mesh.position.addScaledVector(kb.velocity, dt);
          enemy.mesh.position.y = Math.max(0, enemy.mesh.position.y);
          applyWorldCollision(enemy);
        }

        kb.velocity.multiplyScalar(Math.pow(0.1, dt));
        kb.velocity.y *= 0.5;

        if (kb.velocity.lengthSq() < 0.01) {
          kb.active = false;
          enemy.mesh.position.y = 0;
          if (enemyAI) {
            enemyAI.notifyKnockbackEnd(enemy);
          }
        }
      } else if (pathing && !enemy.components.health?.dead) {
        const vel = pathing.desiredVelocity;
        if (vel.lengthSq() > 0.0001) {
          enemy.mesh.position.addScaledVector(vel, dt);
          if (animation && animation.state !== 'death' && animation.state !== 'hit') {
            animation.state = 'walk';
          }
        } else {
          if (animation && animation.state === 'walk') {
            animation.state = 'idle';
          }
        }
      }

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