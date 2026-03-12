import * as THREE from 'three';

/**
 * Lightweight enemy runtime orchestrator.
 * Owns per-frame controller updates, animation state plumbing, collider sync,
 * and movement application (AI desiredVelocity + knockback + world collision).
 *
 * Spider-specific locomotion (raycast-based surface adhesion):
 *   - surface.normal tracks current contact surface (floor / wall / ceiling)
 *   - Each frame, raycasts detect the surface beneath the spider (into
 *     -surface.normal), upcoming walls (forward probe), and edge-wrap
 *     opportunities when the surface ray misses.
 *   - Movement is projected onto the tangent plane of surface.normal so the
 *     spider slides along whatever surface it's on.
 *   - Shockwave knockback launches spiders into a 3D arc (gravity applied).
 *     On raycast landing detection they re-adhere to the struck surface.
 *   - Spiders ignore all non-world colliders (enemies, items, other spiders).
 */
export function createEnemyRuntime(world, player, options = {}) {
  const scratchPlayerPos = new THREE.Vector3();
  const SPIDER_DEBUG = (() => {
    try {
      if (typeof window === 'undefined') return false;
      return window.__SPIDER_DEBUG__ === true ||
        new URLSearchParams(window.location.search).get('spiderDebug') === '1';
    } catch {
      return false;
    }
  })();

  // Max distance an enemy can move in a single sub-step (prevents wall tunneling).
  const MAX_STEP = 0.1;
  const SPIDER_MAX_STEP = 0.04;

  // Spider gravity constant (m/s² downward while airborne)
  const SPIDER_GRAVITY = 9.8;

  // After this many seconds airborne with no landing, safety-reset to floor
  const SPIDER_AIRBORNE_TIMEOUT = 5.0;

  // How far above the surface the spider hovers (raycast adhesion offset)
  const SPIDER_HOVER_OFFSET = 0.05;
  // Max range for the surface-detect ray (into -normal)
  const SPIDER_SURFACE_RAY_RANGE = 0.35;
  // Forward probe range for wall detection
  const SPIDER_FORWARD_PROBE = 0.26;
  // Edge-wrap probe range (cast downward at edge to find next face)
  const SPIDER_EDGE_PROBE = 0.38;
  // Orientation slerp speed during surface transitions (radians-ish per sec)
  const SPIDER_ORIENT_BLEND = 8.0;
  // Spider-spider soft repulsion: radius and strength
  const SPIDER_REPEL_RADIUS = 0.45;
  const SPIDER_REPEL_STRENGTH = 1.2;
  // Max obstacle height (above current surface) that a spider can step over
  // instead of climbing the face. Roughly spider body height.
  const SPIDER_STEP_OVER_HEIGHT = 0.28;
  // Landing detection ray range (longer than hover to catch fast impacts)
  const SPIDER_LAND_DETECT_RANGE = 0.24;
  // Landing lockout right after shockwave launch to avoid immediate re-adhesion
  // to the same nearby wall face.
  const SPIDER_LAND_LOCK_MIN_TIME = 0.12;
  const SPIDER_LAND_LOCK_MIN_TRAVEL = 0.22;
  // Additional post-shockwave guard: reject land hits on the same surface
  // normal near the launch point for a short window.
  const SPIDER_RELAND_SAME_NORMAL_DOT = 0.96;
  const SPIDER_RELAND_MIN_SEPARATION = 0.55;
  // Stuck detection: if a spider moves less than this per second for STUCK_TIME,
  // apply a random tangent-plane nudge to break it free.
  const SPIDER_STUCK_SPEED_THRESHOLD = 0.08; // m/s
  const SPIDER_STUCK_TIME = 0.8;             // seconds of near-zero movement
  const SPIDER_STUCK_NUDGE_SPEED = 0.45;     // gentle nudge speed (m/s)
  const SPIDER_STUCK_NUDGE_COOLDOWN = 0.9;   // prevent rapid left-right jitter
  const SPIDER_CREST_PUSH = 0.08;            // push onto top face after wall->top
  const SPIDER_WALL_FLOOR_HANDOFF_RANGE = 0.95;
  const SPIDER_WALL_FLOOR_HANDOFF_MIN_DESCEND = 0.05;
  const SPIDER_RECOVER_FLOOR_EXTRA_RANGE = 0.75;

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
  const _rayOrig = new THREE.Vector3();
  const _rayDir  = new THREE.Vector3();
  const _repel   = new THREE.Vector3();
  const _qTarget = new THREE.Quaternion();
  const _qWorld  = new THREE.Quaternion(0, 0, 0, 1); // identity — world up
  const _qAlign  = new THREE.Quaternion();
  const _rotMat  = new THREE.Matrix4();

  function dbgNum(n) {
    return Number.isFinite(n) ? Number(n.toFixed(3)) : n;
  }

  function dbgVec3(v) {
    if (!v) return null;
    return { x: dbgNum(v.x), y: dbgNum(v.y), z: dbgNum(v.z) };
  }

  function spiderDebugLog(enemy, event, payload = null, throttleSeconds = 0) {
    if (!SPIDER_DEBUG || enemy.type !== 'spider') return;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    if (!enemy.state) enemy.state = {};
    const key = `__spiderDbg_${event}`;
    const last = enemy.state[key] ?? -Infinity;
    if (throttleSeconds > 0 && now - last < throttleSeconds) return;
    enemy.state[key] = now;

    const base = {
      id: enemy.mesh.id,
      pos: dbgVec3(enemy.mesh.position),
      normal: dbgVec3(enemy.components.surface?.normal),
    };
    console.log(`[SpiderDBG][${event}]`, payload ? { ...base, ...payload } : base);
  }

  function setEnemyAI(ai) {
    enemyAI = ai;
  }

  function getEnemies() {
    if (world.getEnemies) return world.getEnemies();
    if (Array.isArray(world.enemies)) return world.enemies;
    return [];
  }

  // ── Standard AABB world collision (used by zombies) ─────────────────────

  /**
   * Slide enemy position along world colliders (simple AABB pushback).
   * Used by ground-based enemies (zombies). Spiders use raycast-based
   * surface detection + resolveSpiderOverlaps for safety.
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

  // ── Spider raycast surface detection ────────────────────────────────────

  /**
   * Cast a ray against all world-geometry AABBs (skips enemy colliders).
   * Uses the slab method for ray-AABB intersection.
   * Returns { distance, normal, point } for closest hit, or null.
   */
  const _hitPoint = new THREE.Vector3();
  const _hitNormal = new THREE.Vector3();

  function raycastWorldColliders(origin, direction, maxDist, selfBox) {
    const colliders = world.colliders;
    if (!colliders || colliders.length === 0) return null;

    let bestDist = maxDist;
    let hit = false;

    for (let i = 0; i < colliders.length; i++) {
      const box = colliders[i];
      if (box === selfBox) continue;
      if (box._enemyCollider) continue; // skip all enemy colliders

      const bMin = box.min;
      const bMax = box.max;

      // Slab method
      let tMin = 0;
      let tMax = bestDist;
      let enterAxis = -1;
      let enterSign = 1;

      for (let a = 0; a < 3; a++) {
        const o = a === 0 ? origin.x : a === 1 ? origin.y : origin.z;
        const d = a === 0 ? direction.x : a === 1 ? direction.y : direction.z;
        const mn = a === 0 ? bMin.x : a === 1 ? bMin.y : bMin.z;
        const mx = a === 0 ? bMax.x : a === 1 ? bMax.y : bMax.z;

        if (Math.abs(d) < 1e-8) {
          // Ray parallel to slab — miss if origin outside
          if (o < mn || o > mx) { tMin = Infinity; break; }
          continue;
        }

        let t1 = (mn - o) / d;
        let t2 = (mx - o) / d;
        let sign = -1; // normal points toward -axis at mn face
        if (t1 > t2) {
          const tmp = t1; t1 = t2; t2 = tmp;
          sign = 1; // swapped — normal points toward +axis at mx face
        }

        if (t1 > tMin) { tMin = t1; enterAxis = a; enterSign = sign; }
        if (t2 < tMax) { tMax = t2; }

        if (tMin > tMax) { tMin = Infinity; break; }
      }

      if (tMin < 0) continue; // box is behind ray
      if (tMin >= bestDist) continue; // farther than current best
      if (tMin > tMax) continue; // miss

      bestDist = tMin;
      _hitPoint.copy(origin).addScaledVector(direction, tMin);
      _hitNormal.set(0, 0, 0);
      if (enterAxis === 0) _hitNormal.x = enterSign;
      else if (enterAxis === 1) _hitNormal.y = enterSign;
      else _hitNormal.z = enterSign;
      hit = true;
    }

    if (!hit) return null;
    return { distance: bestDist, normal: _hitNormal.clone(), point: _hitPoint.clone() };
  }

  // ── Spider AABB safety collision (prevents tunneling/embedding only) ──────

  /**
   * Pushes spider out of any overlapping world colliders (AABB pushback).
   * This is a safety net — does NOT determine surface normal.
   * Returns true if any overlap was resolved.
   */
  function resolveSpiderOverlaps(enemy) {
    const col = enemy.components.collision;
    if (!col || !col.box) return false;

    const colliders = world.colliders;
    if (!colliders || colliders.length === 0) return false;

    const pos = enemy.mesh.position;
    const hs = col.halfSize;
    const footY = col.footOffsetY || 0;
    let resolved = false;

    for (let i = 0; i < colliders.length; i++) {
      const box = colliders[i];
      if (box === col.box) continue;
      if (box._enemyCollider) continue;

      const bMin = box.min;
      const bMax = box.max;

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

      const ox1 = eMaxX - bMin.x;
      const ox2 = bMax.x - eMinX;
      const oy1 = eMaxY - bMin.y;
      const oy2 = bMax.y - eMinY;
      const oz1 = eMaxZ - bMin.z;
      const oz2 = bMax.z - eMinZ;

      const minOX = Math.min(ox1, ox2);
      const minOY = Math.min(oy1, oy2);
      const minOZ = Math.min(oz1, oz2);

      if (minOX <= minOY && minOX <= minOZ) {
        pos.x += ox1 < ox2 ? -ox1 : ox2;
      } else if (minOY <= minOX && minOY <= minOZ) {
        pos.y += oy1 < oy2 ? -oy1 : oy2;
      } else {
        pos.z += oz1 < oz2 ? -oz1 : oz2;
      }
      resolved = true;
    }

    return resolved;
  }

  // ── Spider surface direction helpers ────────────────────────────────────

  /**
   * Remap travel direction from one surface to another using quaternion rotation.
   */
  function remapSpiderDirectionToSurface(direction, fromNormal, toNormal, outDir) {
    _prevN.copy(fromNormal).normalize();
    _tmpN.copy(toNormal).normalize();

    outDir.copy(direction);
    if (outDir.lengthSq() < 0.0001) {
      outDir.set(0, 0, -1);
    } else {
      outDir.normalize();
    }

    _qAlign.setFromUnitVectors(_prevN, _tmpN);
    outDir.applyQuaternion(_qAlign);
    outDir.addScaledVector(_tmpN, -outDir.dot(_tmpN));

    if (outDir.lengthSq() < 0.0001) {
      outDir.set(0, 1, 0).addScaledVector(_tmpN, -_tmpN.y);
      if (outDir.lengthSq() < 0.0001) {
        outDir.set(1, 0, 0).addScaledVector(_tmpN, -_tmpN.x);
      }
    }
    outDir.normalize();
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
    const dot = vel.dot(normal);
    return vel.clone().addScaledVector(normal, -dot);
  }

  function getSpiderAdhesionOffset(enemy, normal) {
    const col = enemy.components?.collision;
    const hs = col?.halfSize;
    if (!hs || !normal) return SPIDER_HOVER_OFFSET;

    // Keep floor hover visually low; on walls/ceilings, offset by collider extent
    // along the contact normal so the AABB doesn't remain embedded.
    if (Math.abs(normal.y) > 0.7) {
      return SPIDER_HOVER_OFFSET;
    }

    const projectedExtent =
      Math.abs(normal.x) * hs.x +
      Math.abs(normal.y) * hs.y +
      Math.abs(normal.z) * hs.z;

    return Math.max(SPIDER_HOVER_OFFSET, projectedExtent + 0.015);
  }

  function trySpiderWallToFloorHandoff(enemy, surf, tangentVel, pos, selfBox) {
    // If spider is on a wall and movement intent is downward, try to acquire
    // floor below and transition directly, rather than clinging to wall forever.
    if (Math.abs(surf.normal.y) > 0.45) return false; // not wall-like
    const forceRecover = surf._recoverToFloorTimer > 0;
    const minDescend = forceRecover ? -0.005 : SPIDER_WALL_FLOOR_HANDOFF_MIN_DESCEND;
    if (tangentVel.y > -minDescend) return false;

    _rayOrig.copy(pos).addScaledVector(surf.normal, 0.06);
    if (tangentVel.lengthSq() > 0.0001) {
      _tmpDir.copy(tangentVel).normalize();
      _rayOrig.addScaledVector(_tmpDir, 0.04);
    }

    const probeRange = SPIDER_WALL_FLOOR_HANDOFF_RANGE + (forceRecover ? SPIDER_RECOVER_FLOOR_EXTRA_RANGE : 0);
    const floorHit = raycastWorldColliders(
      _rayOrig,
      _tmpDir.set(0, -1, 0),
      probeRange,
      selfBox
    );

    if (!floorHit || floorHit.normal.y < 0.7) return false;

    _prevN.copy(surf.normal);
    const preDir = _tmpDir.copy(tangentVel).normalize();
    snapSpiderToSurface(enemy, floorHit.normal);
    remapSpiderDirectionToSurface(preDir, _prevN, surf.normal, surf.travelDir);
    pos.copy(floorHit.point).addScaledVector(floorHit.normal, getSpiderAdhesionOffset(enemy, floorHit.normal));

    spiderDebugLog(enemy, 'WallFloorHandoff', {
      floorHitPoint: dbgVec3(floorHit.point),
      floorHitNormal: dbgVec3(floorHit.normal),
      preDir: dbgVec3(preDir),
      postDir: dbgVec3(surf.travelDir),
    }, 0.1);

    return true;
  }

  // ── Impact damage stub ────────────────────────────────────────────────────

  /**
   * Calculate (but do NOT apply) damage when a spider impacts a solid surface.
   * Wire this up when spider damage becomes active.
   * @param {object} enemy – the spider entity
   * @param {number} impactSpeed – speed at moment of surface contact (m/s)
   * @returns {number} computed damage (currently unused)
   */
  function onSpiderSurfaceImpact(enemy, impactSpeed) {
    // Damage threshold: impacts below this speed deal no damage
    const IMPACT_THRESHOLD = 3.0;
    const DAMAGE_PER_MPS = 2.0; // damage per m/s above threshold
    if (impactSpeed < IMPACT_THRESHOLD) return 0;
    const damage = (impactSpeed - IMPACT_THRESHOLD) * DAMAGE_PER_MPS;
    // TODO: wire to enemy.components.health when spider damage is enabled
    // e.g. enemy.components.health.current -= damage;
    return damage;
  }

  // ── Spider-spider soft repulsion ──────────────────────────────────────────

  /**
   * Apply a gentle tangent-plane push away from nearby spiders so they
   * spread out instead of clumping. The push is projected onto the current
   * surface so it doesn't detach them from walls/ceilings.
   */
  function applySpiderRepulsion(enemy, dt) {
    const enemies = getEnemies();
    const pos = enemy.mesh.position;
    const surf = enemy.components.surface;
    _repel.set(0, 0, 0);

    for (let i = 0; i < enemies.length; i++) {
      const other = enemies[i];
      if (other === enemy) continue;
      if (other.type !== 'spider') continue;
      if (other.components.health?.dead) continue;

      const oPos = other.mesh.position;
      const dx = pos.x - oPos.x;
      const dy = pos.y - oPos.y;
      const dz = pos.z - oPos.z;
      const distSq = dx * dx + dy * dy + dz * dz;

      if (distSq >= SPIDER_REPEL_RADIUS * SPIDER_REPEL_RADIUS || distSq < 0.0001) continue;

      const dist = Math.sqrt(distSq);
      // Strength falls off linearly: full at center, zero at radius edge
      const strength = (1 - dist / SPIDER_REPEL_RADIUS) * SPIDER_REPEL_STRENGTH;
      _repel.x += (dx / dist) * strength;
      _repel.y += (dy / dist) * strength;
      _repel.z += (dz / dist) * strength;
    }

    if (_repel.lengthSq() < 0.0001) return;

    // Project repulsion onto surface tangent plane so it doesn't push
    // spiders off walls/ceilings
    const nDot = _repel.dot(surf.normal);
    _repel.addScaledVector(surf.normal, -nDot);

    pos.addScaledVector(_repel, dt);
  }

  // ── Per-enemy update helpers ──────────────────────────────────────────────

  function updateSpider(enemy, dt, kb, isKnockedBack, pathing, animation, collision) {
    const surf = enemy.components.surface;
    const col = enemy.components.collision;
    const selfBox = col ? col.box : null;

    if (!surf.travelDir) {
      surf.travelDir = new THREE.Vector3(0, 0, -1);
    }
    // Lazy-init stuck detection state
    if (surf._stuckTimer === undefined) {
      surf._stuckTimer = 0;
      surf._stuckCooldown = 0;
      surf._prevPos = new THREE.Vector3().copy(enemy.mesh.position);
    }
    if (surf._landLockTimer === undefined) surf._landLockTimer = 0;
    if (surf._airTravel === undefined) surf._airTravel = 0;
    if (surf._relandGuardTimer === undefined) surf._relandGuardTimer = 0;
    if (surf._recoverToFloorTimer === undefined) surf._recoverToFloorTimer = 0;
    if (surf._recoverToFloorTimer > 0) {
      surf._recoverToFloorTimer = Math.max(0, surf._recoverToFloorTimer - dt);
    }

    if (isKnockedBack) {
      // ══ AIRBORNE ARC PHASE (shockwave knockback) ═══════════════════════
      kb.velocity.y -= SPIDER_GRAVITY * dt;

      const speed = kb.velocity.length();
      const rawStep = speed * dt;
      const impactSpeed = speed; // capture pre-friction speed for damage calc
      let landed = false;

      // Sub-step to avoid tunneling through thin geometry
      const steps = rawStep > SPIDER_MAX_STEP ? Math.ceil(rawStep / SPIDER_MAX_STEP) : 1;
      const subDt = dt / steps;

      if (surf._landLockTimer > 0) {
        surf._landLockTimer = Math.max(0, surf._landLockTimer - dt);
      }
      if (surf._relandGuardTimer > 0) {
        surf._relandGuardTimer = Math.max(0, surf._relandGuardTimer - dt);
      }

      for (let s = 0; s < steps; s++) {
        enemy.mesh.position.addScaledVector(kb.velocity, subDt);
        surf._airTravel += kb.velocity.length() * subDt;

        const canAttemptLanding =
          surf._landLockTimer <= 0 &&
          surf._airTravel >= SPIDER_LAND_LOCK_MIN_TRAVEL;

        // Raycast in velocity direction to detect approaching surface
        if (canAttemptLanding && kb.velocity.lengthSq() > 0.0001) {
          _rayDir.copy(kb.velocity).normalize();
          _rayOrig.copy(enemy.mesh.position);
          const hit = raycastWorldColliders(_rayOrig, _rayDir, SPIDER_LAND_DETECT_RANGE, selfBox);
          if (hit) {
            const sameLaunchFace =
              surf._launchNormal &&
              surf._launchNormal.lengthSq() > 0.0001 &&
              hit.normal.dot(surf._launchNormal) >= SPIDER_RELAND_SAME_NORMAL_DOT;
            const launchSep =
              surf._launchPos && surf._launchPos.lengthSq() > 0.0001
                ? hit.point.distanceTo(surf._launchPos)
                : Infinity;

            if (
              surf._relandGuardTimer > 0 &&
              sameLaunchFace &&
              launchSep < SPIDER_RELAND_MIN_SEPARATION
            ) {
              spiderDebugLog(enemy, 'AirLandRejectSameFace', {
                launchSep: dbgNum(launchSep),
                hitNormal: dbgVec3(hit.normal),
                launchNormal: dbgVec3(surf._launchNormal),
                guard: dbgNum(surf._relandGuardTimer),
              }, 0.1);
              continue;
            }

            if (surf._recoverToFloorTimer > 0 && hit.normal.y < 0.7) {
              // During post-shockwave recovery, avoid re-attaching to walls.
              // Keep flying briefly until we can reacquire a floor-like face,
              // but still push out and deflect so we never phase through walls.
              enemy.mesh.position
                .copy(hit.point)
                .addScaledVector(hit.normal, getSpiderAdhesionOffset(enemy, hit.normal));

              const intoWall = kb.velocity.dot(hit.normal);
              if (intoWall < 0) {
                kb.velocity.addScaledVector(hit.normal, -intoWall);
              }
              kb.velocity.addScaledVector(hit.normal, 0.28);
              kb.velocity.y -= 0.45;
              spiderDebugLog(enemy, 'AirLandRejectRecoverFloor', {
                hitNormal: dbgVec3(hit.normal),
                recoverTimer: dbgNum(surf._recoverToFloorTimer),
                kbVel: dbgVec3(kb.velocity),
              }, 0.1);
              continue;
            }

            spiderDebugLog(enemy, 'AirLandHit', {
              impactSpeed: dbgNum(impactSpeed),
              hitNormal: dbgVec3(hit.normal),
              hitPoint: dbgVec3(hit.point),
              kbVel: dbgVec3(kb.velocity),
            });
            // Place spider at hit point, offset by hover distance along normal
            enemy.mesh.position.copy(hit.point).addScaledVector(hit.normal, getSpiderAdhesionOffset(enemy, hit.normal));

            // Snap orientation to landing surface
            _prevN.copy(surf.normal);
            snapSpiderToSurface(enemy, hit.normal);
            remapSpiderDirectionToSurface(
              _tmpDir.copy(kb.velocity).normalize(),
              _prevN, surf.normal, surf.travelDir
            );

            // Multiple overlap resolve passes to fully exit the wall
            for (let pass = 0; pass < 3; pass++) {
              if (!resolveSpiderOverlaps(enemy)) break;
            }

            // Re-probe local faces after push-out to make sure we're snapped
            // to a valid nearby surface and not left grazing inside corners.
            _rayOrig.copy(enemy.mesh.position);
            let postHit = null;
            // Prefer preserving current adhesion first; probing down first tends
            // to collapse wall/ceiling crawls back to floor.
            _rayDir.copy(surf.normal).negate();
            postHit = raycastWorldColliders(_rayOrig, _rayDir, 0.55, selfBox);
            if (!postHit && kb.velocity.lengthSq() > 0.0001) {
              _rayDir.copy(kb.velocity).normalize().negate();
              postHit = raycastWorldColliders(_rayOrig, _rayDir, 0.55, selfBox);
            }
            if (!postHit) postHit = raycastWorldColliders(_rayOrig, _tmpDir.set(1, 0, 0), 0.55, selfBox);
            if (!postHit) postHit = raycastWorldColliders(_rayOrig, _tmpDir.set(-1, 0, 0), 0.55, selfBox);
            if (!postHit) postHit = raycastWorldColliders(_rayOrig, _tmpDir.set(0, 0, 1), 0.55, selfBox);
            if (!postHit) postHit = raycastWorldColliders(_rayOrig, _tmpDir.set(0, 0, -1), 0.55, selfBox);
            if (!postHit) postHit = raycastWorldColliders(_rayOrig, _tmpDir.set(0, -1, 0), 0.55, selfBox);
            if (!postHit) postHit = raycastWorldColliders(_rayOrig, _tmpDir.set(0, 1, 0), 0.55, selfBox);

            if (postHit) {
              enemy.mesh.position.copy(postHit.point).addScaledVector(postHit.normal, getSpiderAdhesionOffset(enemy, postHit.normal));
              _prevN.copy(surf.normal);
              snapSpiderToSurface(enemy, postHit.normal);
              remapSpiderDirectionToSurface(
                _tmpDir.copy(kb.velocity).normalize(),
                _prevN, surf.normal, surf.travelDir
              );
              spiderDebugLog(enemy, 'AirLandPostSnap', {
                postHitNormal: dbgVec3(postHit.normal),
                postHitPoint: dbgVec3(postHit.point),
                travelDir: dbgVec3(surf.travelDir),
              });
            }

            // Compute impact damage (not applied yet)
            onSpiderSurfaceImpact(enemy, impactSpeed);

            surf.airborne = false;
            surf.airborneTimer = 0;
            surf._relandGuardTimer = 0;
            kb.velocity.set(0, 0, 0);
            kb.active = false;
            if (enemyAI) enemyAI.notifyKnockbackEnd(enemy);
            landed = true;
            break;
          }
        }

        // Also check if we're already embedded in geometry (safety)
        if (resolveSpiderOverlaps(enemy)) {
          spiderDebugLog(enemy, 'AirOverlapResolve', {
            kbVel: dbgVec3(kb.velocity),
          }, 0.2);

          // If landing is still lock-gated, keep airborne but resolve penetration.
          if (!canAttemptLanding) {
            for (let pass = 0; pass < 3; pass++) {
              if (!resolveSpiderOverlaps(enemy)) break;
            }
            kb.velocity.multiplyScalar(0.72);
            spiderDebugLog(enemy, 'AirOverlapPushoutOnly', {
              lockTimer: dbgNum(surf._landLockTimer),
              airTravel: dbgNum(surf._airTravel),
              kbVel: dbgVec3(kb.velocity),
            }, 0.1);
            continue;
          }

          // Run additional passes to fully exit deep embeds
          for (let pass = 0; pass < 3; pass++) {
            if (!resolveSpiderOverlaps(enemy)) break;
          }

          // Probe multiple directions to find the best landing surface
          _rayOrig.copy(enemy.mesh.position);
          let landHit = null;
          // 1) Down
          landHit = raycastWorldColliders(_rayOrig, _tmpDir.set(0, -1, 0), 0.6, selfBox);
          // 2) Back along velocity (surface we hit)
          if (!landHit && kb.velocity.lengthSq() > 0.0001) {
            _rayDir.copy(kb.velocity).normalize().negate();
            landHit = raycastWorldColliders(_rayOrig, _rayDir, 0.6, selfBox);
          }
          // 3) Along each axis to catch side-walls
          if (!landHit) landHit = raycastWorldColliders(_rayOrig, _tmpDir.set(1, 0, 0), 0.6, selfBox);
          if (!landHit) landHit = raycastWorldColliders(_rayOrig, _tmpDir.set(-1, 0, 0), 0.6, selfBox);
          if (!landHit) landHit = raycastWorldColliders(_rayOrig, _tmpDir.set(0, 0, 1), 0.6, selfBox);
          if (!landHit) landHit = raycastWorldColliders(_rayOrig, _tmpDir.set(0, 0, -1), 0.6, selfBox);
          // 4) Up (ceiling)
          if (!landHit) landHit = raycastWorldColliders(_rayOrig, _tmpDir.set(0, 1, 0), 0.6, selfBox);

          if (landHit) {
            enemy.mesh.position.copy(landHit.point).addScaledVector(landHit.normal, getSpiderAdhesionOffset(enemy, landHit.normal));
            _prevN.copy(surf.normal);
            snapSpiderToSurface(enemy, landHit.normal);
            remapSpiderDirectionToSurface(
              _tmpDir.copy(kb.velocity).normalize(),
              _prevN, surf.normal, surf.travelDir
            );
            spiderDebugLog(enemy, 'AirOverlapSnap', {
              landHitNormal: dbgVec3(landHit.normal),
              landHitPoint: dbgVec3(landHit.point),
              travelDir: dbgVec3(surf.travelDir),
            });
          } else {
            surf.normal.set(0, 1, 0);
            enemy.mesh.quaternion.copy(_qWorld);
            spiderDebugLog(enemy, 'AirOverlapFallbackFloor', {
              reason: 'no landHit found',
            });
          }
          onSpiderSurfaceImpact(enemy, impactSpeed);
          surf.airborne = false;
          surf.airborneTimer = 0;
          kb.velocity.set(0, 0, 0);
          kb.active = false;
          if (enemyAI) enemyAI.notifyKnockbackEnd(enemy);
          landed = true;
          break;
        }
      }

      if (!landed) {
        // Air friction: 0.35^dt ≈ 35% velocity retained per second — damps quickly
        // to prevent residual energy causing bounces on landing
        kb.velocity.multiplyScalar(Math.pow(0.35, dt));

        surf.airborneTimer += dt;

        if (surf.airborneTimer >= SPIDER_AIRBORNE_TIMEOUT) {
          // Safety reset — out of world recovery
          surf.normal.set(0, 1, 0);
          surf.airborne = false;
          surf.airborneTimer = 0;
          enemy.mesh.position.y = Math.max(0, enemy.mesh.position.y);
          enemy.mesh.quaternion.copy(_qWorld);
          kb.velocity.set(0, 0, 0);
          kb.active = false;
          if (enemyAI) enemyAI.notifyKnockbackEnd(enemy);
        }
      }

    } else if (pathing && !enemy.components.health?.dead) {
      // ══ SURFACE-WALK PHASE (raycast-based adhesion) ════════════════════
      const vel = pathing.desiredVelocity;
      const pos = enemy.mesh.position;

      if (vel.lengthSq() > 0.0001) {
        const desiredSpeed = vel.length();

        // Project AI velocity onto current surface tangent plane
        const tangentVel = projectOntoSurface(vel, surf.normal);
        if (tangentVel.lengthSq() < 0.0001) {
          // AI wants to move straight into/away from surface — use stored travelDir
          if (surf.travelDir.lengthSq() > 0.0001) {
            tangentVel.copy(surf.travelDir).normalize().multiplyScalar(desiredSpeed);
          }
        } else {
          tangentVel.normalize().multiplyScalar(desiredSpeed);
        }

        // Immediately after shockwave, if still on a wall, bias travel down the
        // wall so the spider can hand off back to floor.
        if (surf._recoverToFloorTimer > 0 && Math.abs(surf.normal.y) < 0.45) {
          _tmpDir.set(0, -1, 0);
          _tmpDir.addScaledVector(surf.normal, -_tmpDir.dot(surf.normal));
          if (_tmpDir.lengthSq() > 0.0001) {
            _tmpDir.normalize();
            tangentVel.copy(_tmpDir).multiplyScalar(Math.max(desiredSpeed, pathing.moveSpeed * 0.85));
          }
        }

        // Move spider along the surface tangent
        pos.addScaledVector(tangentVel, dt);

        // ── Ray 1: Surface adhesion ray ──────────────────────────────────
        // Cast from spider center into -normal to find the surface beneath us
        _rayDir.copy(surf.normal).negate();
        _rayOrig.copy(pos).addScaledVector(surf.normal, 0.1); // slight offset outward
        const surfHit = raycastWorldColliders(_rayOrig, _rayDir, SPIDER_SURFACE_RAY_RANGE, selfBox);

        if (trySpiderWallToFloorHandoff(enemy, surf, tangentVel, pos, selfBox)) {
          // Transitioned from wall to floor; continue with new adhered state.
        } else {

          // ── Ray 2: Forward probe for wall detection ──────────────────────
          // Cast in travel direction to detect upcoming walls
          let fwdHit = null;
          if (tangentVel.lengthSq() > 0.0001) {
            _rayDir.copy(tangentVel).normalize();
            _rayOrig.copy(pos);
            fwdHit = raycastWorldColliders(_rayOrig, _rayDir, SPIDER_FORWARD_PROBE, selfBox);
          }

          if (fwdHit) {
          // Hit a wall/obstacle ahead — check if we can step over it
          const newNormal = fwdHit.normal;
          const normalDot = newNormal.dot(surf.normal);

          // Step-over check: if on a floor-like surface and the obstacle top
          // is within stepping height, hop on top instead of climbing the face.
          let steppedOver = false;
          if (normalDot < 0.95 && Math.abs(surf.normal.y) > 0.7) {
            // Cast a ray downward from above the obstacle to find its top
            _rayOrig.copy(fwdHit.point);
            _rayOrig.y += SPIDER_STEP_OVER_HEIGHT;
            // also nudge slightly past the obstacle face
            _rayOrig.addScaledVector(newNormal, -0.05);
            const topHit = raycastWorldColliders(_rayOrig, _tmpDir.set(0, -1, 0), SPIDER_STEP_OVER_HEIGHT + 0.05, selfBox);
            if (topHit && topHit.normal.y > 0.7) {
              // Found a walkable top within step height — hop up
              pos.copy(topHit.point).addScaledVector(topHit.normal, getSpiderAdhesionOffset(enemy, topHit.normal));
              surf.travelDir.copy(tangentVel).normalize();
              steppedOver = true;
            }
          }

          if (!steppedOver && normalDot < 0.95) {
            _prevN.copy(surf.normal);
            const preDir = _tmpDir.copy(tangentVel).normalize();
            snapSpiderToSurface(enemy, newNormal);
            remapSpiderDirectionToSurface(preDir, _prevN, surf.normal, surf.travelDir);
            // Position at the wall surface with hover offset
            pos.copy(fwdHit.point).addScaledVector(newNormal, getSpiderAdhesionOffset(enemy, newNormal));

            // Crest assist: when transitioning from wall-like to floor-like,
            // push slightly forward on the new surface so we clear the lip.
            if (Math.abs(_prevN.y) < 0.45 && surf.normal.y > 0.7) {
              pos.addScaledVector(surf.travelDir, SPIDER_CREST_PUSH);
            }
          } else if (!steppedOver && surfHit) {
            // Same surface — just maintain adhesion
            pos.copy(surfHit.point).addScaledVector(surf.normal, getSpiderAdhesionOffset(enemy, surf.normal));
            surf.travelDir.copy(tangentVel).normalize();
          }
          } else if (surfHit) {
          // Still on the same surface — maintain adhesion position
          const hitNormalDot = surfHit.normal.dot(surf.normal);
          if (hitNormalDot < 0.95 && surfHit.distance < SPIDER_SURFACE_RAY_RANGE * 0.8) {
            // Surface curved/changed (e.g. floor→ramp) — update normal
            _prevN.copy(surf.normal);
            const preDir = _tmpDir.copy(tangentVel).normalize();
            snapSpiderToSurface(enemy, surfHit.normal);
            remapSpiderDirectionToSurface(preDir, _prevN, surf.normal, surf.travelDir);
          }
          pos.copy(surfHit.point).addScaledVector(surf.normal, getSpiderAdhesionOffset(enemy, surf.normal));
          if (tangentVel.lengthSq() > 0.0001) {
            surf.travelDir.copy(tangentVel).normalize();
          }
          } else {
          // ── Ray 3: Edge-wrap probe ────────────────────────────────────
          // No surface below and no wall ahead — spider walked off an edge.
          // Probe downward (in original travel direction, then offset) to
          // find the next face and wrap around the corner.
          let edgeHit = null;

          // Probe: from slightly ahead of current pos, cast in -normal direction
          // (which is now pointing away from the vanished surface)
          if (surf.travelDir.lengthSq() > 0.0001) {
            _rayOrig.copy(pos).addScaledVector(surf.travelDir, 0.08);
            _rayDir.copy(surf.normal).negate();
            edgeHit = raycastWorldColliders(_rayOrig, _rayDir, SPIDER_EDGE_PROBE, selfBox);
          }

          if (!edgeHit) {
            // Try casting in the opposite of the current normal (wrapping under)
            _rayOrig.copy(pos);
            _rayDir.copy(surf.travelDir.lengthSq() > 0.0001
              ? surf.travelDir : _tmpDir.set(0, -1, 0));
            _rayDir.normalize();
            edgeHit = raycastWorldColliders(_rayOrig, _rayDir, SPIDER_EDGE_PROBE, selfBox);
          }

          if (edgeHit) {
            // Found the next face — wrap to it
            _prevN.copy(surf.normal);
            const preDir = _tmpDir.copy(surf.travelDir).normalize();
            snapSpiderToSurface(enemy, edgeHit.normal);
            remapSpiderDirectionToSurface(preDir, _prevN, surf.normal, surf.travelDir);
            pos.copy(edgeHit.point).addScaledVector(surf.normal, getSpiderAdhesionOffset(enemy, surf.normal));
          } else {
            // No surface found anywhere — detach and fall
            surf.airborne = true;
            surf.airborneTimer = 0;
            kb.active = true;
            kb.velocity.set(0, -0.8, 0);
            if (surf.travelDir.lengthSq() > 0.0001) {
              kb.velocity.addScaledVector(surf.travelDir, pathing.moveSpeed * 0.25);
            }
          }
          }
        }

        // Safety: resolve any remaining overlaps from the move
        const hadOverlap = resolveSpiderOverlaps(enemy);

        if (hadOverlap) {
          spiderDebugLog(enemy, 'SurfaceOverlapResolve', {
            travelDir: dbgVec3(surf.travelDir),
          }, 0.25);
          // If we had to push out, immediately re-snap to the nearest face
          // so the spider doesn't keep scraping/sticking on subsequent frames.
          _rayOrig.copy(pos);
          let snapHit = null;
          const descendingOnWall = Math.abs(surf.normal.y) < 0.45 && tangentVel.y < -SPIDER_WALL_FLOOR_HANDOFF_MIN_DESCEND;
          const forceRecoverFloor = surf._recoverToFloorTimer > 0 && Math.abs(surf.normal.y) < 0.45;
          // While descending on walls, prefer floor first. Otherwise preserve
          // current adhesion direction first for stable wall/ceiling travel.
          if (descendingOnWall || forceRecoverFloor) {
            snapHit = raycastWorldColliders(_rayOrig, _tmpDir.set(0, -1, 0), forceRecoverFloor ? 0.95 : 0.45, selfBox);
            if (snapHit && forceRecoverFloor && snapHit.normal.y < 0.7) {
              snapHit = null;
            }
          }
          if (!snapHit) snapHit = raycastWorldColliders(_rayOrig, _tmpDir.copy(surf.normal).negate(), 0.45, selfBox);
          if (!snapHit) snapHit = raycastWorldColliders(_rayOrig, _tmpDir.set(1, 0, 0), 0.45, selfBox);
          if (!snapHit) snapHit = raycastWorldColliders(_rayOrig, _tmpDir.set(-1, 0, 0), 0.45, selfBox);
          if (!snapHit) snapHit = raycastWorldColliders(_rayOrig, _tmpDir.set(0, 0, 1), 0.45, selfBox);
          if (!snapHit) snapHit = raycastWorldColliders(_rayOrig, _tmpDir.set(0, 0, -1), 0.45, selfBox);
          if (!snapHit && !descendingOnWall) snapHit = raycastWorldColliders(_rayOrig, _tmpDir.set(0, -1, 0), 0.45, selfBox);
          if (!snapHit) snapHit = raycastWorldColliders(_rayOrig, _tmpDir.set(0, 1, 0), 0.45, selfBox);

          if (snapHit) {
            _prevN.copy(surf.normal);
            snapSpiderToSurface(enemy, snapHit.normal);
            remapSpiderDirectionToSurface(surf.travelDir, _prevN, surf.normal, surf.travelDir);
            pos.copy(snapHit.point).addScaledVector(surf.normal, getSpiderAdhesionOffset(enemy, surf.normal));
            spiderDebugLog(enemy, 'SurfaceOverlapSnap', {
              snapHitNormal: dbgVec3(snapHit.normal),
              snapHitPoint: dbgVec3(snapHit.point),
              travelDir: dbgVec3(surf.travelDir),
            }, 0.25);
          }
        }

        // Soft repulsion to prevent spider clumping
        applySpiderRepulsion(enemy, dt);

        // ── Stuck detection: random nudge if barely moving ───────────────
        {
          const frameDist = pos.distanceTo(surf._prevPos);
          const frameSpeed = dt > 0 ? frameDist / dt : 0;
          surf._prevPos.copy(pos);
          if (surf._stuckCooldown > 0) {
            surf._stuckCooldown = Math.max(0, surf._stuckCooldown - dt);
          }

          if (frameSpeed < SPIDER_STUCK_SPEED_THRESHOLD) {
            surf._stuckTimer += dt;
          } else {
            surf._stuckTimer = 0;
          }

          if (surf._stuckTimer >= SPIDER_STUCK_TIME && surf._stuckCooldown <= 0) {
            // Pick a random direction on the tangent plane and nudge
            const angle = Math.random() * Math.PI * 2;
            _tmpDir.set(Math.cos(angle), 0, Math.sin(angle));
            // Project onto surface tangent plane
            const nDot = _tmpDir.dot(surf.normal);
            _tmpDir.addScaledVector(surf.normal, -nDot);
            if (_tmpDir.lengthSq() > 0.0001) {
              _tmpDir.normalize();

              // Blend toward escape direction rather than hard-flip.
              if (surf.travelDir.lengthSq() > 0.0001) {
                surf.travelDir.lerp(_tmpDir, 0.35).normalize();
              } else {
                surf.travelDir.copy(_tmpDir);
              }

              pos.addScaledVector(surf.travelDir, SPIDER_STUCK_NUDGE_SPEED);
              spiderDebugLog(enemy, 'StuckNudge', {
                frameSpeed: dbgNum(frameSpeed),
                stuckTimer: dbgNum(surf._stuckTimer),
                newTravelDir: dbgVec3(surf.travelDir),
              }, 0.15);
            }
            surf._stuckTimer = 0;
            surf._stuckCooldown = SPIDER_STUCK_NUDGE_COOLDOWN;
          }
        }

        if (animation && animation.state !== 'death' && animation.state !== 'hit') {
          animation.state = 'walk';
        }

        // Face the movement direction on the surface tangent (smooth blend)
        if (tangentVel.lengthSq() > 0.0001) {
          _forward.copy(tangentVel).normalize();
          _up.copy(surf.normal);
          _right2.crossVectors(_forward, _up).normalize();
          if (_right2.lengthSq() < 0.001) {
            // Degenerate (moving parallel to normal) — use arbitrary right
            _right2.set(1, 0, 0);
          }
          _forward.crossVectors(_up, _right2).normalize();
          _rotMat.set(
            _right2.x, _up.x, _forward.x, 0,
            _right2.y, _up.y, _forward.y, 0,
            _right2.z, _up.z, _forward.z, 0,
            0,         0,     0,          1
          );
          _qTarget.setFromRotationMatrix(_rotMat);
          enemy.mesh.quaternion.slerp(
            _qTarget,
            Math.min(1, SPIDER_ORIENT_BLEND * dt)
          );
        }
      } else {
        // Not moving — maintain surface adhesion via raycast
        _rayDir.copy(surf.normal).negate();
        _rayOrig.copy(enemy.mesh.position).addScaledVector(surf.normal, 0.1);
        const idleHit = raycastWorldColliders(_rayOrig, _rayDir, SPIDER_SURFACE_RAY_RANGE, selfBox);
        if (idleHit) {
          enemy.mesh.position.copy(idleHit.point).addScaledVector(surf.normal, getSpiderAdhesionOffset(enemy, surf.normal));
        }

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