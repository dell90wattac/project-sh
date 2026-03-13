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
  const SPIDER_GROUND_DEBUG = (() => {
    try {
      if (typeof window === 'undefined') return false;
      const params = new URLSearchParams(window.location.search);
      const enabledByQuery = params.get('spiderGroundDebug') === '1';
      const enabledByGlobal = window.__SPIDER_GROUND_DEBUG__ === true;
      const enabled = enabledByQuery || enabledByGlobal;
      window.__SPIDER_GROUND_DEBUG__ = enabled;

      if (enabled) {
        if (!Array.isArray(window.__SPIDER_GROUND_EVENTS__)) {
          window.__SPIDER_GROUND_EVENTS__ = [];
        }
        if (typeof window.__clearSpiderGroundEvents !== 'function') {
          window.__clearSpiderGroundEvents = function clearSpiderGroundEvents() {
            if (Array.isArray(window.__SPIDER_GROUND_EVENTS__)) {
              window.__SPIDER_GROUND_EVENTS__.length = 0;
            }
          };
        }
        if (typeof window.__getSpiderGroundEvents !== 'function') {
          window.__getSpiderGroundEvents = function getSpiderGroundEvents(limit = 120) {
            const events = Array.isArray(window.__SPIDER_GROUND_EVENTS__)
              ? window.__SPIDER_GROUND_EVENTS__
              : [];
            const maxEvents = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 120;
            return events.slice(-maxEvents);
          };
        }
      }

      return enabled;
    } catch {
      return false;
    }
  })();
  const SPIDER_INVINCIBLE = (() => {
    try {
      if (typeof window === 'undefined') return false;
      const params = new URLSearchParams(window.location.search);
      const enabledByQuery = params.get('spiderInvincible') === '1';
      const enabledByGlobal = window.__SPIDER_INVINCIBLE__ === true;
      const enabled = enabledByQuery || enabledByGlobal;
      window.__SPIDER_INVINCIBLE__ = enabled;
      return enabled;
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
  const SPIDER_HOVER_OFFSET = 0.08;
  // Max range for the surface-detect ray (into -normal)
  const SPIDER_SURFACE_RAY_RANGE = 0.5;
  // Forward probe range for wall detection
  const SPIDER_FORWARD_PROBE = 0.34;
  // Edge-wrap probe range (cast downward at edge to find next face)
  const SPIDER_EDGE_PROBE = 0.38;
  // Orientation slerp speed during surface transitions (radians-ish per sec)
  const SPIDER_ORIENT_BLEND = 8.0;
  // Spider-spider soft repulsion: radius and strength
  const SPIDER_REPEL_RADIUS = 0.45;
  const SPIDER_REPEL_STRENGTH = 1.2;
  // Max obstacle height (above current surface) that a spider can step over
  // instead of climbing the face. Roughly spider body height.
  const SPIDER_STEP_OVER_HEIGHT = 0.4;
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
  const SPIDER_STUCK_TIME = 0.55;            // seconds of near-zero movement
  const SPIDER_STUCK_NUDGE_SPEED = 0.68;     // gentle nudge speed (m/s)
  const SPIDER_STUCK_NUDGE_COOLDOWN = 0.9;   // prevent rapid left-right jitter
  const SPIDER_CREST_PUSH = 0.12;            // push onto top face after wall->top
  const SPIDER_WALL_FLOOR_HANDOFF_RANGE = 0.95;
  const SPIDER_WALL_FLOOR_HANDOFF_MIN_DESCEND = 0.05;
  const SPIDER_RECOVER_FLOOR_EXTRA_RANGE = 0.75;
  const SPIDER_WALL_TOP_CREST_HEIGHT = 0.56;
  const SPIDER_WALL_TOP_CREST_RANGE = 0.84;
  const SPIDER_FLOOR_REACQUIRE_RANGE = 1.2;
  const SPIDER_WALL_TOP_CREST_LATERAL = 0.24;
  const SPIDER_WALL_TOP_CREST_FORWARD = 0.16;
  const SPIDER_LEDGE_VAULT_COOLDOWN = 0.48;
  const SPIDER_LEDGE_VAULT_PROBE_HEIGHT = 0.86;
  const SPIDER_LEDGE_VAULT_PROBE_RANGE = 1.8;
  const SPIDER_LEDGE_VAULT_SPEED = 3.25;
  const SPIDER_LEDGE_VAULT_UP_SPEED = 2.1;
  const SPIDER_LEDGE_VAULT_OUTWARD_PUSH = 0.7;
  const SPIDER_LEDGE_VAULT_WALL_HANG_TRIGGER = 0.44;
  const SPIDER_LEDGE_VAULT_MIN_TARGET_RISE = 0.12;
  const SPIDER_LEDGE_VAULT_MIN_CLIMB_BEFORE_VAULT = 0.52;
  const SPIDER_LEDGE_VAULT_MIN_FORCED_CLIMB = 0.78;
  const SPIDER_LEDGE_VAULT_FORCE_MIN_Y = 0.78;
  const SPIDER_LEDGE_VAULT_STALL_TIME = 0.24;
  const SPIDER_LEDGE_VAULT_FORCE_ASCEND_MAX = 0.08;
  const SPIDER_LEDGE_VAULT_PEAK_WINDOW = 0.14;
  const SPIDER_GLOBAL_FLOOR_RESCUE_MIN_Y = 0.04;
  const SPIDER_EMERGENCY_FLOOR_LAND_Y = 0.42;
  const SPIDER_EMERGENCY_FLOOR_PROBE_HEIGHT = 0.36;
  const SPIDER_EMERGENCY_FLOOR_PROBE_RANGE = 0.9;
  const SPIDER_FLOOR_STICK_PROBE_HEIGHT = 0.34;
  const SPIDER_FLOOR_STICK_PROBE_RANGE = 1.05;
  const SPIDER_FLOOR_SINK_TOLERANCE = 0.002;
  // Spider distance-based update throttling (performance).
  const SPIDER_LOD_NEAR = 12;
  const SPIDER_LOD_MID = 22;
  const SPIDER_LOD_SKIP_MID = 3;
  const SPIDER_LOD_SKIP_FAR = 6;
  const SPIDER_LOD_NEAR_SQ = SPIDER_LOD_NEAR * SPIDER_LOD_NEAR;
  const SPIDER_LOD_MID_SQ = SPIDER_LOD_MID * SPIDER_LOD_MID;

  // 2D broadphase grid for spider crawl raycasts. This keeps ray-AABB tests
  // bounded when many spiders are active.
  const SPIDER_RAY_GRID_SIZE = 1.5;
  const SPIDER_RAY_GRID_PADDING = 0.25;

  let enemyAI = options.enemyAI || null;
  let doorSystems = Array.isArray(options.doorSystems) ? options.doorSystems : [];

  const SPIDER_IMPACT_MIN_SPEED = 1.2;
  const SPIDER_IMPACT_MAX_SPEED = 8.0;
  const SPIDER_IMPACT_MIN_DAMAGE = 4;
  const SPIDER_IMPACT_MAX_DAMAGE = 12;
  const SPIDER_DOOR_SWING_MIN_SPEED = 0.2;
  const SPIDER_DOOR_DAMAGE_MAX = 5;
  const SPIDER_DOOR_HIT_COOLDOWN = 0.22;

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
  const _doorPivot = new THREE.Vector3();
  const _doorLocalPos = new THREE.Vector3();
  const _doorNormal = new THREE.Vector3();
  const _doorQuat = new THREE.Quaternion();
  const _doorInvQuat = new THREE.Quaternion();
  const _rayEnd = new THREE.Vector3();

  let spiderRayGrid = null;
  let spiderRayGridSource = null;
  let spiderRayGridColliderCount = -1;
  const spiderRayCandidateSet = new Set();
  const spiderRayCandidates = [];

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

  function spiderGroundLog(enemy, event, payload = null, throttleSeconds = 0) {
    if (!SPIDER_GROUND_DEBUG || enemy.type !== 'spider') return;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    if (!enemy.state) enemy.state = {};
    const key = `__spiderGroundDbg_${event}`;
    const last = enemy.state[key] ?? -Infinity;
    if (throttleSeconds > 0 && now - last < throttleSeconds) return;
    enemy.state[key] = now;

    const surf = enemy.components.surface;
    const base = {
      t: dbgNum(now),
      id: enemy.mesh.id,
      pos: dbgVec3(enemy.mesh.position),
      normal: dbgVec3(surf?.normal),
      airborne: !!surf?.airborne,
      recoverTimer: dbgNum(surf?._recoverToFloorTimer ?? 0),
      landLock: dbgNum(surf?._landLockTimer ?? 0),
      relandGuard: dbgNum(surf?._relandGuardTimer ?? 0),
    };

    const entry = payload
      ? { event, ...base, ...payload }
      : { event, ...base };

    console.log(`[SpiderGroundDBG][${event}]`, entry);

    try {
      if (typeof window !== 'undefined' && Array.isArray(window.__SPIDER_GROUND_EVENTS__)) {
        const events = window.__SPIDER_GROUND_EVENTS__;
        events.push(entry);
        if (events.length > 700) {
          events.splice(0, events.length - 700);
        }
      }
    } catch {
      // Debug mode should never impact gameplay.
    }
  }

  if (SPIDER_GROUND_DEBUG) {
    console.log('[SpiderGroundDBG] enabled (?spiderGroundDebug=1). Use window.__getSpiderGroundEvents()');
  }
  if (SPIDER_INVINCIBLE) {
    console.log('[SpiderInvincible] enabled (?spiderInvincible=1)');
  }

  function isSpiderInvincible() {
    try {
      if (typeof window === 'undefined') return SPIDER_INVINCIBLE;
      return window.__SPIDER_INVINCIBLE__ === true;
    } catch {
      return SPIDER_INVINCIBLE;
    }
  }

  function setEnemyAI(ai) {
    enemyAI = ai;
  }

  function setDoorSystems(systems) {
    doorSystems = Array.isArray(systems) ? systems : [];
  }

  function getNowSeconds() {
    return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  }

  function ensureSpiderCombat(enemy) {
    if (!enemy.components.spiderCombat) {
      enemy.components.spiderCombat = {
        impactArmed: false,
        launchStrength: 0,
        lastImpactDamage: 0,
        lastImpactSpeed: 0,
        lastDamageSource: null,
        lastDamageAt: -Infinity,
        doorHits: Object.create(null),
      };
    }
    return enemy.components.spiderCombat;
  }

  function applySpiderDamage(enemy, amount, source, extra = null) {
    const health = enemy.components.health;
    if (!health || health.dead) return 0;

    const finalDamage = Math.max(0, amount);
    if (finalDamage <= 0) return 0;

    if (isSpiderInvincible()) {
      spiderGroundLog(enemy, 'DamageBlockedInvincible', {
        source,
        amount: dbgNum(finalDamage),
        hp: dbgNum(health.current),
        extra,
      }, 0.02);
      return 0;
    }

    health.current = Math.max(0, health.current - finalDamage);

    const combat = ensureSpiderCombat(enemy);
    combat.lastDamageSource = source;
    combat.lastDamageAt = getNowSeconds();
    if (source === 'impact') {
      combat.lastImpactDamage = finalDamage;
      if (extra && Number.isFinite(extra.impactSpeed)) {
        combat.lastImpactSpeed = extra.impactSpeed;
      }
    }

    if (health.current <= 0) {
      health.dead = true;
      const kb = enemy.components.knockback;
      if (kb) {
        kb.active = false;
        kb.velocity.set(0, 0, 0);
      }
      const surf = enemy.components.surface;
      if (surf) {
        surf.airborne = false;
        surf.airborneTimer = 0;
      }
    }

    spiderDebugLog(enemy, 'DamageTaken', {
      source,
      amount: dbgNum(finalDamage),
      hp: dbgNum(health.current),
      extra,
    }, 0.05);

    spiderGroundLog(enemy, 'DamageTaken', {
      source,
      amount: dbgNum(finalDamage),
      hp: dbgNum(health.current),
      dead: !!health.dead,
      extra,
    }, 0.03);

    if (health.dead) {
      spiderGroundLog(enemy, 'MarkedDead', {
        source,
        hp: dbgNum(health.current),
        extra,
      }, 0);
    }

    return finalDamage;
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

  function spiderGridKey(x, z) {
    return `${x},${z}`;
  }

  function addSpiderRayGridCell(grid, x, z, box) {
    const key = spiderGridKey(x, z);
    let list = grid.get(key);
    if (!list) {
      list = [];
      grid.set(key, list);
    }
    list.push(box);
  }

  function rebuildSpiderRayGrid(colliders) {
    const grid = new Map();
    const inv = 1 / SPIDER_RAY_GRID_SIZE;

    for (let i = 0; i < colliders.length; i++) {
      const box = colliders[i];
      if (box._enemyCollider) continue;

      const minX = Math.floor((box.min.x - SPIDER_RAY_GRID_PADDING) * inv);
      const maxX = Math.floor((box.max.x + SPIDER_RAY_GRID_PADDING) * inv);
      const minZ = Math.floor((box.min.z - SPIDER_RAY_GRID_PADDING) * inv);
      const maxZ = Math.floor((box.max.z + SPIDER_RAY_GRID_PADDING) * inv);

      for (let gx = minX; gx <= maxX; gx++) {
        for (let gz = minZ; gz <= maxZ; gz++) {
          addSpiderRayGridCell(grid, gx, gz, box);
        }
      }
    }

    spiderRayGrid = grid;
    spiderRayGridSource = colliders;
    spiderRayGridColliderCount = colliders.length;
  }

  function getRaycastCandidates(colliders, origin, direction, maxDist) {
    if (!colliders || colliders.length === 0) return colliders;
    if (colliders.length < 48) return colliders;

    if (
      spiderRayGridSource !== colliders ||
      spiderRayGridColliderCount !== colliders.length ||
      !spiderRayGrid
    ) {
      rebuildSpiderRayGrid(colliders);
    }

    _rayEnd.copy(origin).addScaledVector(direction, maxDist);

    const inv = 1 / SPIDER_RAY_GRID_SIZE;
    const minX = Math.floor((Math.min(origin.x, _rayEnd.x) - SPIDER_RAY_GRID_PADDING) * inv);
    const maxX = Math.floor((Math.max(origin.x, _rayEnd.x) + SPIDER_RAY_GRID_PADDING) * inv);
    const minZ = Math.floor((Math.min(origin.z, _rayEnd.z) - SPIDER_RAY_GRID_PADDING) * inv);
    const maxZ = Math.floor((Math.max(origin.z, _rayEnd.z) + SPIDER_RAY_GRID_PADDING) * inv);

    spiderRayCandidateSet.clear();
    spiderRayCandidates.length = 0;

    for (let gx = minX; gx <= maxX; gx++) {
      for (let gz = minZ; gz <= maxZ; gz++) {
        const bucket = spiderRayGrid.get(spiderGridKey(gx, gz));
        if (!bucket) continue;

        for (let i = 0; i < bucket.length; i++) {
          const box = bucket[i];
          if (spiderRayCandidateSet.has(box)) continue;
          spiderRayCandidateSet.add(box);
          spiderRayCandidates.push(box);
        }
      }
    }

    return spiderRayCandidates.length > 0 ? spiderRayCandidates : colliders;
  }

  function raycastWorldColliders(origin, direction, maxDist, selfBox) {
    const colliders = world.getSpiderCrawlColliders
      ? world.getSpiderCrawlColliders()
      : world.colliders;
    if (!colliders || colliders.length === 0) return null;

    const candidates = getRaycastCandidates(colliders, origin, direction, maxDist);

    let bestDist = maxDist;
    let hit = false;

    for (let i = 0; i < candidates.length; i++) {
      const box = candidates[i];
      if (box === selfBox) continue;
      if (box._enemyCollider) continue; // skip all enemy colliders

      const bMin = box.min;
      const bMax = box.max;

      // Robust slab method with inside-box support.
      // If the ray starts inside a box, we use the nearest exit face (tMax)
      // and its normal instead of returning an invalid fallback axis.
      let tMin = -Infinity;
      let tMax = bestDist;
      let enterAxis = -1;
      let enterSign = 1;
      let exitAxis = -1;
      let exitSign = 1;

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
        let nearSign = -1; // entering mn face
        let farSign = 1;   // exiting mx face
        if (t1 > t2) {
          const tmp = t1; t1 = t2; t2 = tmp;
          nearSign = 1; // entering mx face
          farSign = -1; // exiting mn face
        }

        if (t1 > tMin) {
          tMin = t1;
          enterAxis = a;
          enterSign = nearSign;
        }
        if (t2 < tMax) {
          tMax = t2;
          exitAxis = a;
          exitSign = farSign;
        }

        if (tMin > tMax) { tMin = Infinity; break; }
      }

      if (!Number.isFinite(tMin)) continue;
      if (tMax < 0) continue; // box is behind ray
      if (tMin > tMax) continue; // miss

      const startedInside = tMin < 0;
      const hitDist = startedInside ? tMax : tMin;
      const hitAxis = startedInside ? exitAxis : enterAxis;
      const hitSign = startedInside ? exitSign : enterSign;

      if (hitDist < 0) continue;
      if (hitDist >= bestDist) continue; // farther than current best
      if (hitAxis < 0) continue;

      bestDist = hitDist;
      _hitPoint.copy(origin).addScaledVector(direction, hitDist);
      _hitNormal.set(0, 0, 0);
      if (hitAxis === 0) _hitNormal.x = hitSign;
      else if (hitAxis === 1) _hitNormal.y = hitSign;
      else _hitNormal.z = hitSign;
      hit = true;
    }

    if (!hit) return null;
    return { distance: bestDist, normal: _hitNormal.clone(), point: _hitPoint.clone() };
  }

  function raycastWalkableSurface(origin, direction, maxDist, selfBox, minNormalY = 0.7) {
    const colliders = world.getSpiderCrawlColliders
      ? world.getSpiderCrawlColliders()
      : world.colliders;
    if (!colliders || colliders.length === 0) return null;

    const candidates = getRaycastCandidates(colliders, origin, direction, maxDist);

    let bestDist = maxDist;
    let hit = false;

    for (let i = 0; i < candidates.length; i++) {
      const box = candidates[i];
      if (box === selfBox) continue;
      if (box._enemyCollider) continue;

      const bMin = box.min;
      const bMax = box.max;

      let tMin = -Infinity;
      let tMax = bestDist;
      let enterAxis = -1;
      let enterSign = 1;
      let exitAxis = -1;
      let exitSign = 1;

      for (let a = 0; a < 3; a++) {
        const o = a === 0 ? origin.x : a === 1 ? origin.y : origin.z;
        const d = a === 0 ? direction.x : a === 1 ? direction.y : direction.z;
        const mn = a === 0 ? bMin.x : a === 1 ? bMin.y : bMin.z;
        const mx = a === 0 ? bMax.x : a === 1 ? bMax.y : bMax.z;

        if (Math.abs(d) < 1e-8) {
          if (o < mn || o > mx) { tMin = Infinity; break; }
          continue;
        }

        let t1 = (mn - o) / d;
        let t2 = (mx - o) / d;
        let nearSign = -1;
        let farSign = 1;
        if (t1 > t2) {
          const tmp = t1; t1 = t2; t2 = tmp;
          nearSign = 1;
          farSign = -1;
        }

        if (t1 > tMin) {
          tMin = t1;
          enterAxis = a;
          enterSign = nearSign;
        }
        if (t2 < tMax) {
          tMax = t2;
          exitAxis = a;
          exitSign = farSign;
        }

        if (tMin > tMax) { tMin = Infinity; break; }
      }

      if (!Number.isFinite(tMin)) continue;
      if (tMax < 0) continue;
      if (tMin > tMax) continue;

      const startedInside = tMin < 0;
      const hitDist = startedInside ? tMax : tMin;
      const hitAxis = startedInside ? exitAxis : enterAxis;
      const hitSign = startedInside ? exitSign : enterSign;

      if (hitDist < 0) continue;
      if (hitDist >= bestDist) continue;
      if (hitAxis < 0) continue;

      _hitNormal.set(0, 0, 0);
      if (hitAxis === 0) _hitNormal.x = hitSign;
      else if (hitAxis === 1) _hitNormal.y = hitSign;
      else _hitNormal.z = hitSign;

      if (_hitNormal.y < minNormalY) continue;

      bestDist = hitDist;
      _hitPoint.copy(origin).addScaledVector(direction, hitDist);
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
    const floorHit = raycastWalkableSurface(
      _rayOrig,
      _tmpDir.set(0, -1, 0),
      probeRange,
      selfBox,
      0.7
    );

    if (!floorHit) return false;

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

  function trySpiderWallToTopCrest(enemy, surf, tangentVel, pos, selfBox) {
    if (Math.abs(surf.normal.y) > 0.45) return false; // not wall-like
    if (tangentVel.y < -0.18) return false; // hard descending, prefer floor handoff

    _tmpDir.copy(tangentVel);
    if (_tmpDir.lengthSq() < 0.0001) return false;
    _tmpDir.normalize();

    _right2.crossVectors(_tmpDir, surf.normal);
    if (_right2.lengthSq() < 0.0001) {
      _right2.set(1, 0, 0).addScaledVector(surf.normal, -surf.normal.x);
    }
    if (_right2.lengthSq() < 0.0001) return false;
    _right2.normalize();

    let topHit = null;
    let bestTopY = Infinity;
    const lateralOffsets = [0, -SPIDER_WALL_TOP_CREST_LATERAL, SPIDER_WALL_TOP_CREST_LATERAL];
    const forwardOffsets = [0.08, SPIDER_WALL_TOP_CREST_FORWARD, SPIDER_WALL_TOP_CREST_FORWARD * 1.6, SPIDER_WALL_TOP_CREST_FORWARD * 2.1];
    const verticalOffsets = [SPIDER_WALL_TOP_CREST_HEIGHT, SPIDER_WALL_TOP_CREST_HEIGHT + 0.2];

    for (let v = 0; v < verticalOffsets.length; v++) {
      for (let f = 0; f < forwardOffsets.length; f++) {
        for (let l = 0; l < lateralOffsets.length; l++) {
          _rayOrig.copy(pos)
            .addScaledVector(surf.normal, 0.10)
            .addScaledVector(_tmpDir, forwardOffsets[f])
            .addScaledVector(_right2, lateralOffsets[l]);
          _rayOrig.y += verticalOffsets[v];

          const candidate = raycastWalkableSurface(
            _rayOrig,
            _pushDir.set(0, -1, 0),
            SPIDER_WALL_TOP_CREST_RANGE,
            selfBox,
            0.7
          );

          if (!candidate) continue;
          const nearLip = candidate.distance <= 0.45;
          if (candidate.point.y < pos.y - 0.14) continue;
          if (!nearLip && candidate.point.y < pos.y - 0.03) continue;
          if (candidate.point.y > pos.y + 1.25) continue;

          // Prefer the lowest valid walkable top so we choose the desk/counter
          // surface over decorative clutter sitting on top of it.
          if (candidate.point.y < bestTopY) {
            bestTopY = candidate.point.y;
            topHit = candidate;
          }
        }
      }
    }

    if (!topHit) return false;

    _prevN.copy(surf.normal);
    const preDir = _tmpDir.copy(tangentVel).normalize();
    snapSpiderToSurface(enemy, topHit.normal);
    remapSpiderDirectionToSurface(preDir, _prevN, surf.normal, surf.travelDir);
    pos.copy(topHit.point).addScaledVector(topHit.normal, getSpiderAdhesionOffset(enemy, topHit.normal));
    pos.addScaledVector(surf.travelDir, SPIDER_CREST_PUSH);

    spiderDebugLog(enemy, 'WallTopCrest', {
      topHitPoint: dbgVec3(topHit.point),
      topHitNormal: dbgVec3(topHit.normal),
      preDir: dbgVec3(preDir),
      postDir: dbgVec3(surf.travelDir),
    }, 0.1);

    return true;
  }

  function trySpiderFloorReacquire(enemy, surf, pos, selfBox) {
    _rayOrig.copy(pos);
    _rayOrig.y += 0.22;

    let floorHit = raycastWalkableSurface(
      _rayOrig,
      _tmpDir.set(0, -1, 0),
      SPIDER_FLOOR_REACQUIRE_RANGE,
      selfBox,
      0.7
    );

    // If we're partially embedded in floor slabs, a downward ray can miss
    // walkable faces (it exits through underside). Probe upward as fallback.
    if (!floorHit) {
      _rayOrig.copy(pos);
      _rayOrig.y -= 0.08;
      floorHit = raycastWalkableSurface(
        _rayOrig,
        _tmpDir.set(0, 1, 0),
        0.95,
        selfBox,
        0.7
      );
    }

    if (!floorHit) return false;

    _prevN.copy(surf.normal);
    snapSpiderToSurface(enemy, floorHit.normal);
    remapSpiderDirectionToSurface(surf.travelDir, _prevN, surf.normal, surf.travelDir);
    pos.copy(floorHit.point).addScaledVector(floorHit.normal, getSpiderAdhesionOffset(enemy, floorHit.normal));

    spiderDebugLog(enemy, 'FloorReacquire', {
      floorHitPoint: dbgVec3(floorHit.point),
      floorHitNormal: dbgVec3(floorHit.normal),
    }, 0.1);

    return true;
  }

  function trySpiderLedgeVault(enemy, surf, tangentVel, pos, selfBox, pathing, kb, targetPos) {
    if (Math.abs(surf.normal.y) > 0.68) return false; // only on wall-like surfaces
    if ((surf._ledgeVaultCooldown || 0) > 0) return false;
    if (tangentVel.lengthSq() < 0.0001) return false;

    const climbGain = pos.y - (surf._wallStartY ?? pos.y);
    if (climbGain < SPIDER_LEDGE_VAULT_MIN_CLIMB_BEFORE_VAULT) return false;

    _tmpDir.copy(tangentVel).normalize();
    _right2.crossVectors(_tmpDir, surf.normal);
    if (_right2.lengthSq() < 0.0001) {
      _right2.set(1, 0, 0).addScaledVector(surf.normal, -surf.normal.x);
    }
    if (_right2.lengthSq() < 0.0001) return false;
    _right2.normalize();

    const forwardOffsets = [0.08, 0.2, 0.34, 0.5, 0.7];
    const lateralOffsets = [0, -0.24, 0.24, -0.38, 0.38];
    const verticalOffsets = [
      SPIDER_LEDGE_VAULT_PROBE_HEIGHT,
      SPIDER_LEDGE_VAULT_PROBE_HEIGHT + 0.24,
      SPIDER_LEDGE_VAULT_PROBE_HEIGHT + 0.5,
    ];

    let bestHit = null;
    let bestScore = -Infinity;

    for (let v = 0; v < verticalOffsets.length; v++) {
      for (let f = 0; f < forwardOffsets.length; f++) {
        for (let l = 0; l < lateralOffsets.length; l++) {
          _rayOrig.copy(pos)
            .addScaledVector(surf.normal, 0.12)
            .addScaledVector(_tmpDir, forwardOffsets[f])
            .addScaledVector(_right2, lateralOffsets[l]);
          _rayOrig.y += verticalOffsets[v];

          const candidate = raycastWorldColliders(
            _rayOrig,
            _pushDir.set(0, -1, 0),
            SPIDER_LEDGE_VAULT_PROBE_RANGE,
            selfBox
          );

          if (!candidate || candidate.normal.y < 0.6) continue;
          if (candidate.point.y < pos.y + SPIDER_LEDGE_VAULT_MIN_TARGET_RISE) continue;
          if (candidate.point.y > pos.y + 1.2) continue;

          _pushDir.copy(candidate.point).sub(pos);
          const ahead = _pushDir.dot(_tmpDir);
          if (ahead < -0.08) continue;

          const heightPenalty = Math.abs(candidate.point.y - pos.y) * 0.55;
          const lipBonus = candidate.distance <= 0.55 ? 0.5 : 0;
          let playerScore = 0;
          if (targetPos) {
            playerScore = -Math.sqrt(candidate.point.distanceToSquared(targetPos)) * 0.12;
          }

          const score = ahead * 1.8 - heightPenalty + lipBonus + playerScore;
          if (score > bestScore) {
            bestScore = score;
            bestHit = candidate;
          }
        }
      }
    }

    const forcedVault =
      !bestHit &&
      (surf._wallHangTimer || 0) >= SPIDER_LEDGE_VAULT_WALL_HANG_TRIGGER &&
      climbGain >= SPIDER_LEDGE_VAULT_MIN_FORCED_CLIMB &&
      pos.y >= SPIDER_LEDGE_VAULT_FORCE_MIN_Y &&
      tangentVel.y <= SPIDER_LEDGE_VAULT_FORCE_ASCEND_MAX &&
      (
        (surf._wallStallTimer || 0) >= SPIDER_LEDGE_VAULT_STALL_TIME ||
        ((surf._wallPeakY ?? pos.y) - pos.y) <= SPIDER_LEDGE_VAULT_PEAK_WINDOW
      );

    if (!bestHit && !forcedVault) return false;

    if (bestHit) {
      _pushDir.copy(bestHit.point).sub(pos);
      if (_pushDir.lengthSq() < 0.0001) {
        _pushDir.copy(_tmpDir);
      }
    } else {
      _pushDir.copy(_tmpDir);
    }

    if (targetPos) {
      _tmpN.copy(targetPos).sub(pos);
      if (_tmpN.lengthSq() > 0.0001) {
        _tmpN.normalize();
        _pushDir.lerp(_tmpN, forcedVault ? 0.75 : 0.6);
      }
    }

    // Push outward from the wall and add arc to force a lip clear.
    _pushDir.addScaledVector(surf.normal, SPIDER_LEDGE_VAULT_OUTWARD_PUSH);
    _pushDir.y = Math.max(_pushDir.y, forcedVault ? 0.4 : 0.14);
    if (_pushDir.lengthSq() < 0.0001) return false;
    _pushDir.normalize();

    const launchSpeed = Math.max(SPIDER_LEDGE_VAULT_SPEED, (pathing?.moveSpeed || 1.2) * 1.85);
    kb.velocity.copy(_pushDir).multiplyScalar(launchSpeed);
    kb.velocity.y += SPIDER_LEDGE_VAULT_UP_SPEED;

    const maxVaultSpeed = 6.2;
    const speedSq = kb.velocity.lengthSq();
    if (speedSq > maxVaultSpeed * maxVaultSpeed) {
      kb.velocity.multiplyScalar(maxVaultSpeed / Math.sqrt(speedSq));
    }

    kb.active = true;
    surf.airborne = true;
    surf.airborneTimer = 0;
    surf._airTravel = 0;
    surf._landLockTimer = Math.max(surf._landLockTimer || 0, 0.08);
    surf._recoverToFloorTimer = Math.max(surf._recoverToFloorTimer || 0, 0.45);
    surf._ledgeVaultCooldown = SPIDER_LEDGE_VAULT_COOLDOWN;
    surf._wallHangTimer = 0;
    surf._wallStallTimer = 0;
    if (surf._launchNormal) {
      surf._launchNormal.copy(surf.normal).normalize();
    }
    if (surf._launchPos) {
      surf._launchPos.copy(pos);
    }

    spiderDebugLog(enemy, 'LedgeVault', {
      launchVel: dbgVec3(kb.velocity),
      forced: forcedVault,
      climbGain: dbgNum(climbGain),
      wallStall: dbgNum(surf._wallStallTimer || 0),
      topPoint: dbgVec3(bestHit?.point),
      topNormal: dbgVec3(bestHit?.normal),
      targetPos: dbgVec3(targetPos),
    }, 0.08);

    return true;
  }

  function trySpiderGlobalFloorRescue(enemy, surf, pos, selfBox) {
    if (pos.y >= SPIDER_GLOBAL_FLOOR_RESCUE_MIN_Y) return false;

    _rayOrig.copy(pos);
    _rayOrig.y += 1.5;

    const floorHit = raycastWalkableSurface(
      _rayOrig,
      _tmpDir.set(0, -1, 0),
      3.2,
      selfBox,
      0.7
    );

    if (!floorHit) return false;

    _prevN.copy(surf.normal);
    snapSpiderToSurface(enemy, floorHit.normal);
    remapSpiderDirectionToSurface(surf.travelDir, _prevN, surf.normal, surf.travelDir);
    pos.copy(floorHit.point).addScaledVector(floorHit.normal, getSpiderAdhesionOffset(enemy, floorHit.normal));
    surf.airborne = false;
    surf.airborneTimer = 0;

    spiderDebugLog(enemy, 'GlobalFloorRescue', {
      floorHitPoint: dbgVec3(floorHit.point),
      floorHitNormal: dbgVec3(floorHit.normal),
    }, 0.1);

    return true;
  }

  function trySpiderEmergencyFloorLanding(enemy, surf, pos, selfBox, kb, impactSpeed) {
    if (kb.velocity.y > 0.05) return false;
    if (pos.y > SPIDER_EMERGENCY_FLOOR_LAND_Y) return false;

    _rayOrig.copy(pos);
    _rayOrig.y += SPIDER_EMERGENCY_FLOOR_PROBE_HEIGHT;

    const floorHit = raycastWalkableSurface(
      _rayOrig,
      _tmpDir.set(0, -1, 0),
      SPIDER_EMERGENCY_FLOOR_PROBE_RANGE,
      selfBox,
      0.72
    );

    if (!floorHit) return false;

    _prevN.copy(surf.normal);
    enemy.mesh.position.copy(floorHit.point).addScaledVector(floorHit.normal, getSpiderAdhesionOffset(enemy, floorHit.normal));
    snapSpiderToSurface(enemy, floorHit.normal);
    if (kb.velocity.lengthSq() > 0.0001) {
      remapSpiderDirectionToSurface(_tmpDir.copy(kb.velocity).normalize(), _prevN, surf.normal, surf.travelDir);
    } else {
      remapSpiderDirectionToSurface(surf.travelDir, _prevN, surf.normal, surf.travelDir);
    }

    onSpiderSurfaceImpact(enemy, impactSpeed, floorHit.normal);
    surf.airborne = false;
    surf.airborneTimer = 0;
    surf._landLockTimer = 0;
    surf._landLockMinTravel = SPIDER_LAND_LOCK_MIN_TRAVEL;
    surf._relandGuardTimer = 0;
    kb.velocity.set(0, 0, 0);
    kb.active = false;
    if (enemyAI) enemyAI.notifyKnockbackEnd(enemy);

    spiderDebugLog(enemy, 'EmergencyFloorLanding', {
      floorHitPoint: dbgVec3(floorHit.point),
      floorHitNormal: dbgVec3(floorHit.normal),
      impactSpeed: dbgNum(impactSpeed),
    }, 0.08);
    spiderGroundLog(enemy, 'EmergencyFloorLanding', {
      floorHitPoint: dbgVec3(floorHit.point),
      floorHitNormal: dbgVec3(floorHit.normal),
      impactSpeed: dbgNum(impactSpeed),
    }, 0.03);

    return true;
  }

  // ── Spider combat damage handling ────────────────────────────────────────

  function onSpiderSurfaceImpact(enemy, impactSpeed, impactNormal = null) {
    const combat = ensureSpiderCombat(enemy);
    if (!combat.impactArmed) return 0;

    combat.impactArmed = false;
    combat.launchStrength = 0;

    if (impactSpeed < SPIDER_IMPACT_MIN_SPEED) {
      spiderDebugLog(enemy, 'ImpactTooSoft', {
        impactSpeed: dbgNum(impactSpeed),
      }, 0.05);
      return 0;
    }

    const clampedSpeed = Math.min(impactSpeed, SPIDER_IMPACT_MAX_SPEED);
    const normalized = (clampedSpeed - SPIDER_IMPACT_MIN_SPEED)
      / (SPIDER_IMPACT_MAX_SPEED - SPIDER_IMPACT_MIN_SPEED);
    const damage = SPIDER_IMPACT_MIN_DAMAGE
      + Math.max(0, Math.min(1, normalized)) * (SPIDER_IMPACT_MAX_DAMAGE - SPIDER_IMPACT_MIN_DAMAGE);

    return applySpiderDamage(enemy, damage, 'impact', {
      impactSpeed: dbgNum(impactSpeed),
      impactNormal: dbgVec3(impactNormal),
    });
  }

  function applySpiderDoorDamage(enemy) {
    if (!doorSystems || doorSystems.length === 0) return;

    const surf = enemy.components.surface;
    const kb = enemy.components.knockback;
    if (!surf || surf.airborne || kb?.active || surf.normal.y < 0.65) return;

    const health = enemy.components.health;
    if (!health || health.dead) return;

    const col = enemy.components.collision;
    const radius = col?.halfSize ? Math.max(col.halfSize.x, col.halfSize.z) : 0.16;
    const combat = ensureSpiderCombat(enemy);
    const now = getNowSeconds();

    for (let i = 0; i < doorSystems.length; i++) {
      const doorEntry = doorSystems[i];
      const interaction = doorEntry?.system?.getInteraction ? doorEntry.system.getInteraction() : null;
      if (!interaction || Math.abs(interaction.doorAngularVel) < SPIDER_DOOR_SWING_MIN_SPEED) continue;

      const door = doorEntry.door;
      door.pivot.getWorldPosition(_doorPivot);
      door.pivot.getWorldQuaternion(_doorQuat);
      _doorInvQuat.copy(_doorQuat).invert();
      _doorLocalPos.copy(enemy.mesh.position).sub(_doorPivot).applyQuaternion(_doorInvQuat);

      const touching =
        _doorLocalPos.x >= -radius &&
        _doorLocalPos.x <= door.thickness + radius &&
        _doorLocalPos.z >= -radius &&
        _doorLocalPos.z <= door.width + radius &&
        _doorLocalPos.y >= -0.2 &&
        _doorLocalPos.y <= door.height + 0.2;

      const hitState = combat.doorHits[doorEntry.id] || {
        touching: false,
        lastHitAt: -Infinity,
        lastSwingDir: 0,
      };
      combat.doorHits[doorEntry.id] = hitState;

      if (!touching) {
        hitState.touching = false;
        continue;
      }

      const swingDir = Math.sign(interaction.doorAngularVel) || hitState.lastSwingDir || 1;
      const leverArm = Math.max(0.12, Math.min(door.width, Math.max(0, _doorLocalPos.z)));
      const panelSpeed = Math.abs(interaction.doorAngularVel) * leverArm;
      const shouldDamage =
        (!hitState.touching || hitState.lastSwingDir !== swingDir) &&
        now - hitState.lastHitAt >= SPIDER_DOOR_HIT_COOLDOWN;

      if (shouldDamage) {
        const damage = Math.min(SPIDER_DOOR_DAMAGE_MAX, Math.max(1, panelSpeed * 5));
        applySpiderDamage(enemy, damage, 'door', {
          panelSpeed: dbgNum(panelSpeed),
          doorId: doorEntry.id,
        });

        _doorNormal.set(1, 0, 0).applyQuaternion(_doorQuat);
        enemy.mesh.position.addScaledVector(_doorNormal, swingDir * 0.03);

        hitState.lastHitAt = now;
        hitState.lastSwingDir = swingDir;
      }

      hitState.touching = true;
    }
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
    if (surf._landLockMinTravel === undefined) surf._landLockMinTravel = SPIDER_LAND_LOCK_MIN_TRAVEL;
    if (surf._airTravel === undefined) surf._airTravel = 0;
    if (surf._relandGuardTimer === undefined) surf._relandGuardTimer = 0;
    if (surf._recoverToFloorTimer === undefined) surf._recoverToFloorTimer = 0;
    if (surf._ledgeVaultCooldown === undefined) surf._ledgeVaultCooldown = 0;
    if (surf._wallHangTimer === undefined) surf._wallHangTimer = 0;
    if (surf._wallStartY === undefined) surf._wallStartY = enemy.mesh.position.y;
    if (surf._wallPeakY === undefined) surf._wallPeakY = enemy.mesh.position.y;
    if (surf._wallPrevY === undefined) surf._wallPrevY = enemy.mesh.position.y;
    if (surf._wallStallTimer === undefined) surf._wallStallTimer = 0;
    if (surf._wasWallLike === undefined) surf._wasWallLike = false;
    if (surf._recoverToFloorTimer > 0) {
      surf._recoverToFloorTimer = Math.max(0, surf._recoverToFloorTimer - dt);
    }
    if (surf._ledgeVaultCooldown > 0) {
      surf._ledgeVaultCooldown = Math.max(0, surf._ledgeVaultCooldown - dt);
    }
    if (!surf.airborne && Math.abs(surf.normal.y) < 0.68) {
      if (!surf._wasWallLike) {
        surf._wallStartY = enemy.mesh.position.y;
        surf._wallPeakY = enemy.mesh.position.y;
        surf._wallPrevY = enemy.mesh.position.y;
        surf._wallStallTimer = 0;
        surf._wallHangTimer = 0;
      }
      surf._wallHangTimer += dt;

      const deltaY = enemy.mesh.position.y - surf._wallPrevY;
      surf._wallPrevY = enemy.mesh.position.y;
      if (enemy.mesh.position.y > surf._wallPeakY) {
        surf._wallPeakY = enemy.mesh.position.y;
      }

      if (deltaY < 0.015) {
        surf._wallStallTimer += dt;
      } else {
        surf._wallStallTimer = Math.max(0, surf._wallStallTimer - dt * 0.5);
      }
      surf._wasWallLike = true;
    } else {
      surf._wallHangTimer = 0;
      surf._wallStallTimer = 0;
      surf._wasWallLike = false;
    }

    if (isKnockedBack) {
      // ══ AIRBORNE ARC PHASE (shockwave knockback) ═══════════════════════
      if (SPIDER_GROUND_DEBUG) {
        surf._groundDbgPrevY = enemy.mesh.position.y;
      }
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
          surf._airTravel >= (surf._landLockMinTravel ?? SPIDER_LAND_LOCK_MIN_TRAVEL);

        if (trySpiderEmergencyFloorLanding(enemy, surf, enemy.mesh.position, selfBox, kb, impactSpeed)) {
          landed = true;
          break;
        }

        // Raycast in velocity direction to detect approaching surface
        if (canAttemptLanding && kb.velocity.lengthSq() > 0.0001) {
          _rayDir.copy(kb.velocity).normalize();
          _rayOrig.copy(enemy.mesh.position);
          let hit = raycastWorldColliders(_rayOrig, _rayDir, SPIDER_LAND_DETECT_RANGE, selfBox);
          if (hit && hit.normal.y < 0.7 && kb.velocity.y <= 0) {
            _rayOrig.copy(enemy.mesh.position);
            _rayOrig.y += 0.2;
            const floorHit = raycastWalkableSurface(_rayOrig, _tmpDir.set(0, -1, 0), SPIDER_FLOOR_REACQUIRE_RANGE, selfBox, 0.7);
            if (floorHit) {
              hit = floorHit;
            }
          }

          if (hit && hit.normal.y < -0.25 && (surf._recoverToFloorTimer > 0 || enemy.mesh.position.y < 0.55)) {
            _rayOrig.copy(enemy.mesh.position);
            _rayOrig.y += 0.5;
            const floorHit = raycastWalkableSurface(_rayOrig, _tmpDir.set(0, -1, 0), 1.4, selfBox, 0.7);
            if (floorHit) {
              hit = floorHit;
            } else {
              spiderDebugLog(enemy, 'AirLandRejectUnderside', {
                hitNormal: dbgVec3(hit.normal),
                pos: dbgVec3(enemy.mesh.position),
              }, 0.08);
              continue;
            }
          }

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
            spiderGroundLog(enemy, 'AirLandHit', {
              impactSpeed: dbgNum(impactSpeed),
              hitNormal: dbgVec3(hit.normal),
              hitPoint: dbgVec3(hit.point),
              kbVel: dbgVec3(kb.velocity),
              airTravel: dbgNum(surf._airTravel),
            }, 0.03);
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

            if (postHit && postHit.normal.y < -0.25 && (surf._recoverToFloorTimer > 0 || enemy.mesh.position.y < 0.55)) {
              _rayOrig.copy(enemy.mesh.position);
              _rayOrig.y += 0.45;
              const floorPostHit = raycastWalkableSurface(_rayOrig, _tmpDir.set(0, -1, 0), 1.2, selfBox, 0.7);
              if (floorPostHit) {
                postHit = floorPostHit;
              } else {
                postHit = null;
              }
            }

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
              spiderGroundLog(enemy, 'AirLandPostSnap', {
                postHitNormal: dbgVec3(postHit.normal),
                postHitPoint: dbgVec3(postHit.point),
                travelDir: dbgVec3(surf.travelDir),
              }, 0.03);
            }

            // Compute impact damage (not applied yet)
            onSpiderSurfaceImpact(enemy, impactSpeed, hit.normal);

            surf.airborne = false;
            surf.airborneTimer = 0;
            surf._landLockMinTravel = SPIDER_LAND_LOCK_MIN_TRAVEL;
            surf._relandGuardTimer = 0;
            kb.velocity.set(0, 0, 0);
            kb.active = false;
            if (enemyAI) enemyAI.notifyKnockbackEnd(enemy);
            spiderGroundLog(enemy, 'AirLandingComplete', {
              impactSpeed: dbgNum(impactSpeed),
              landedNormal: dbgVec3(surf.normal),
              travelDir: dbgVec3(surf.travelDir),
            }, 0.03);
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
          // 1) Prefer walkable floor-like face first.
          landHit = raycastWalkableSurface(_rayOrig, _tmpDir.set(0, -1, 0), 0.95, selfBox, 0.7);
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

          if (!landHit || (landHit.normal.y < -0.25 && (surf._recoverToFloorTimer > 0 || enemy.mesh.position.y < 0.55))) {
            _rayOrig.copy(enemy.mesh.position);
            _rayOrig.y += 0.8;
            const fallbackFloorHit = raycastWalkableSurface(_rayOrig, _tmpDir.set(0, -1, 0), 1.8, selfBox, 0.7);
            if (fallbackFloorHit) {
              landHit = fallbackFloorHit;
            }
          }

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
            kb.velocity.multiplyScalar(0.68);
            spiderDebugLog(enemy, 'AirOverlapNoLanding', {
              reason: 'no valid landHit found',
              pos: dbgVec3(enemy.mesh.position),
            }, 0.08);
            continue;
          }
          onSpiderSurfaceImpact(enemy, impactSpeed, landHit.normal);
          surf.airborne = false;
          surf.airborneTimer = 0;
          surf._landLockMinTravel = SPIDER_LAND_LOCK_MIN_TRAVEL;
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
          const combat = ensureSpiderCombat(enemy);
          combat.impactArmed = false;
          combat.launchStrength = 0;
          surf.normal.set(0, 1, 0);
          surf.airborne = false;
          surf.airborneTimer = 0;
          surf._landLockMinTravel = SPIDER_LAND_LOCK_MIN_TRAVEL;
          enemy.mesh.position.y = Math.max(0, enemy.mesh.position.y);
          enemy.mesh.quaternion.copy(_qWorld);
          kb.velocity.set(0, 0, 0);
          kb.active = false;
          if (enemyAI) enemyAI.notifyKnockbackEnd(enemy);
        }

        trySpiderGlobalFloorRescue(enemy, surf, enemy.mesh.position, selfBox);
      }

    } else if (pathing && !enemy.components.health?.dead) {
      // ══ SURFACE-WALK PHASE (raycast-based adhesion) ════════════════════
      const vel = pathing.desiredVelocity;
      const pos = enemy.mesh.position;
      let floorClampedThisFrame = false;

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
        } else if (trySpiderWallToTopCrest(enemy, surf, tangentVel, pos, selfBox)) {
          // Transitioned from wall face to a top surface; continue with new adhered state.
        } else if (trySpiderLedgeVault(enemy, surf, tangentVel, pos, selfBox, pathing, kb, scratchPlayerPos)) {
          // Crest fallback: force a short ballistic vault over the lip.
          if (collision && typeof collision.syncFromEntity === 'function') {
            collision.syncFromEntity(enemy);
          }
          return;
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
          if (trySpiderFloorReacquire(enemy, surf, pos, selfBox)) {
            // Reacquired a floor-like surface after a missed adhesion ray.
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

          if (snapHit && snapHit.normal.y < -0.25) {
            // Never keep grounded spiders adhered to underside contacts after
            // overlap recovery; reacquire a walkable floor face instead.
            spiderGroundLog(enemy, 'GroundSnapRejectUnderside', {
              snapHitNormal: dbgVec3(snapHit.normal),
              descendingOnWall,
              forceRecoverFloor,
            }, 0.05);
            _rayOrig.copy(pos);
            _rayOrig.y += 0.45;
            const floorSnapHit = raycastWalkableSurface(
              _rayOrig,
              _tmpDir.set(0, -1, 0),
              1.35,
              selfBox,
              0.7
            );

            if (floorSnapHit) {
              snapHit = floorSnapHit;
            } else {
              _rayOrig.copy(pos);
              _rayOrig.y -= 0.1;
              const floorUpHit = raycastWalkableSurface(
                _rayOrig,
                _tmpDir.set(0, 1, 0),
                1.0,
                selfBox,
                0.7
              );
              snapHit = floorUpHit || null;
            }

            if (!snapHit) {
              spiderGroundLog(enemy, 'GroundSnapFloorFallbackMiss', {
                posY: dbgNum(pos.y),
                normalY: dbgNum(surf.normal.y),
              }, 0.08);
            }
          }

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
            spiderGroundLog(enemy, 'SurfaceOverlapSnap', {
              snapHitNormal: dbgVec3(snapHit.normal),
              snapHitPoint: dbgVec3(snapHit.point),
              travelDir: dbgVec3(surf.travelDir),
            }, 0.08);
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

      const recoveringToFloor = surf._recoverToFloorTimer > 0;
      if (!surf.airborne && (surf.normal.y > 0.65 || pos.y < 0.95 || recoveringToFloor)) {
        _rayOrig.copy(pos);
        _rayOrig.y += SPIDER_FLOOR_STICK_PROBE_HEIGHT;
        const floorStickProbeRange = recoveringToFloor
          ? SPIDER_FLOOR_STICK_PROBE_RANGE + 0.55
          : SPIDER_FLOOR_STICK_PROBE_RANGE;
        let floorHoldHit = raycastWalkableSurface(
          _rayOrig,
          _tmpDir.set(0, -1, 0),
          floorStickProbeRange,
          selfBox,
          0.72
        );

        if (!floorHoldHit) {
          _rayOrig.copy(pos);
          _rayOrig.y -= 0.08;
          floorHoldHit = raycastWalkableSurface(
            _rayOrig,
            _tmpDir.set(0, 1, 0),
            0.95,
            selfBox,
            0.72
          );
        }

        if (!floorHoldHit) {
          spiderGroundLog(enemy, 'FloorStickMiss', {
            recoveringToFloor,
            probeRange: dbgNum(floorStickProbeRange),
            posY: dbgNum(pos.y),
          }, 0.2);
        }

        if (floorHoldHit) {
          const targetY = floorHoldHit.point.y + getSpiderAdhesionOffset(enemy, floorHoldHit.normal);
          if (recoveringToFloor || pos.y < targetY - SPIDER_FLOOR_SINK_TOLERANCE) {
            _prevN.copy(surf.normal);
            snapSpiderToSurface(enemy, floorHoldHit.normal);
            remapSpiderDirectionToSurface(surf.travelDir, _prevN, surf.normal, surf.travelDir);
            pos.copy(floorHoldHit.point).addScaledVector(floorHoldHit.normal, getSpiderAdhesionOffset(enemy, floorHoldHit.normal));
            floorClampedThisFrame = true;
            if (recoveringToFloor && floorHoldHit.normal.y > 0.72) {
              surf._recoverToFloorTimer = Math.min(surf._recoverToFloorTimer, 0.18);
            }
            spiderDebugLog(enemy, 'FloorStickClamp', {
              targetY: dbgNum(targetY),
              posY: dbgNum(pos.y),
            }, 0.15);
            spiderGroundLog(enemy, 'FloorStickClamp', {
              recoveringToFloor,
              targetY: dbgNum(targetY),
              posY: dbgNum(pos.y),
              floorNormal: dbgVec3(floorHoldHit.normal),
            }, 0.08);
          }
        }
      }

      if (SPIDER_GROUND_DEBUG && !surf.airborne) {
        const prevY = surf._groundDbgPrevY;
        if (Number.isFinite(prevY)) {
          const deltaY = pos.y - prevY;
          if (deltaY < -0.004 && !floorClampedThisFrame) {
            _rayOrig.copy(pos);
            _rayOrig.y += SPIDER_FLOOR_STICK_PROBE_HEIGHT;
            const descentFloorHit = raycastWalkableSurface(
              _rayOrig,
              _tmpDir.set(0, -1, 0),
              SPIDER_FLOOR_STICK_PROBE_RANGE + 0.35,
              selfBox,
              0.72
            );

            const targetY = descentFloorHit
              ? descentFloorHit.point.y + getSpiderAdhesionOffset(enemy, descentFloorHit.normal)
              : NaN;

            spiderGroundLog(enemy, 'GroundedDescent', {
              deltaY: dbgNum(deltaY),
              prevY: dbgNum(prevY),
              posY: dbgNum(pos.y),
              hasFloor: !!descentFloorHit,
              floorTargetY: dbgNum(targetY),
              floorNormal: dbgVec3(descentFloorHit?.normal),
              travelDir: dbgVec3(surf.travelDir),
            }, 0.08);
          }
        }
        surf._groundDbgPrevY = pos.y;
      }

      trySpiderGlobalFloorRescue(enemy, surf, pos, selfBox);
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

    if (player && (player.getEnemyTargetPosition || player.getPosition)) {
      scratchPlayerPos.copy(
        player.getEnemyTargetPosition ? player.getEnemyTargetPosition() : player.getPosition()
      );
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

        // Initialise death state on first frame
        if (enemy.state._deathTimer === undefined) {
          enemy.state._deathTimer = 0;
          enemy.state._deathStartY = enemy.mesh.position.y;
          // Reset surface orientation so the flip plays from a clean pose
          enemy.mesh.rotation.x = 0;
          enemy.mesh.rotation.z = 0;
          const _dkb = enemy.components.knockback;
          if (_dkb) { _dkb.active = false; _dkb.velocity.set(0, 0, 0); }
          const _dsurf = enemy.components.surface;
          if (_dsurf) { _dsurf.airborne = false; _dsurf.airborneTimer = 0; }
        }

        enemy.state._deathTimer += dt;

        if (enemy.type === 'spider') {
          // Spiders flip 180° onto their back then drop to the floor.
          // Duration 0.75 s: fast flip ease-out + gravity-accelerated fall.
          const t = Math.min(enemy.state._deathTimer / 0.75, 1);
          const flipEase = 1 - (1 - t) * (1 - t); // ease-out: snappy at start
          enemy.mesh.rotation.z = flipEase * Math.PI;
          const startY = enemy.state._deathStartY ?? 0;
          enemy.mesh.position.y = Math.max(0.06, startY * (1 - t * t)); // keep carcass slightly above floor
        } else {
          // Zombies: tilt forward and sink into floor
          const t = Math.min(enemy.state._deathTimer / 0.6, 1);
          enemy.mesh.rotation.x = t * (Math.PI / 2) * 0.85;
          enemy.mesh.position.y = -t * 0.4;
        }

        continue; // skip movement for dead enemies
      }

      const kb = enemy.components.knockback;
      const surf = enemy.components.surface;
      const isKnockedBack = kb && kb.active;

      // Spider distance LOD: throttle far-away updates unless airborne/knocked back.
      if (enemy.type === 'spider') {
        const dx = enemy.mesh.position.x - scratchPlayerPos.x;
        const dy = enemy.mesh.position.y - scratchPlayerPos.y;
        const dz = enemy.mesh.position.z - scratchPlayerPos.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        let skipFactor = 1;

        if (distSq > SPIDER_LOD_NEAR_SQ) {
          skipFactor = distSq > SPIDER_LOD_MID_SQ ? SPIDER_LOD_SKIP_FAR : SPIDER_LOD_SKIP_MID;
        }

        if (skipFactor > 1 && !isKnockedBack && !surf?.airborne) {
          const state = enemy.state || (enemy.state = {});
          if (state._spiderLodSkip !== skipFactor) {
            state._spiderLodSkip = skipFactor;
            state._spiderLodOffset = Math.floor(Math.random() * skipFactor);
            state._spiderLodFrame = 0;
          }
          state._spiderLodFrame = (state._spiderLodFrame ?? 0) + 1;
          const offset = state._spiderLodOffset ?? 0;
          if ((state._spiderLodFrame + offset) % skipFactor !== 0) {
            continue;
          }
        }
      }

      // Controller hook (idle bob, etc.)
      if (controller && typeof controller.update === 'function') {
        controller.update(dt, { enemy, playerPosition: scratchPlayerPos, world });
      }

      // ── Spider ──────────────────────────────────────────────────────────
      if (enemy.type === 'spider') {
        updateSpider(enemy, dt, kb, isKnockedBack, pathing, animation, collision);
        if (!enemy.components.health?.dead) {
          applySpiderDoorDamage(enemy);
        }
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
    setDoorSystems,
  };
}
