import * as THREE from 'three';

/**
 * Enemy AI system — zone-aware territorial behavior with room-graph pathing.
 *
 * Each enemy is assigned a homeZone (room ID) and an aggroDepth (how many rooms
 * away from home the enemy will chase). The AI state machine handles:
 *   idle    → standing in home zone, small idle motion
 *   wander  → picking random points within home zone bounds, walking to them
 *   chase   → BFS path through room graph toward player, direct steering per-room
 *   return  → walking back to home zone center after losing aggro
 *
 * Shockwave recovery: after knockback ends, the AI re-evaluates its target
 * immediately rather than waiting for the next decision tick. This keeps enemies
 * feeling persistent — they stumble, then lock back on.
 *
 * Designed for ground-based enemies (zombies). Ceiling/wall crawlers (spiders)
 * will use a different pathing strategy layered on top of this system.
 */

const _v = new THREE.Vector3();
const _center = new THREE.Vector3();
const _candidate = new THREE.Vector3();
const _best = new THREE.Vector3();

// ── BFS room-graph pathfinder ────────────────────────────────────────────────

/**
 * Returns an array of room IDs from `fromId` to `toId` (inclusive),
 * or null if no path exists. Uses BFS on the room connection graph.
 */
function findRoomPath(world, fromId, toId) {
  if (fromId === toId) return [fromId];

  const visited = new Set();
  const queue = [[fromId]];
  visited.add(fromId);

  while (queue.length > 0) {
    const path = queue.shift();
    const current = path[path.length - 1];
    const connections = world.getRoomConnections(current);

    for (let i = 0; i < connections.length; i++) {
      const next = connections[i];
      if (visited.has(next)) continue;
      visited.add(next);

      const newPath = path.concat(next);
      if (next === toId) return newPath;
      queue.push(newPath);
    }
  }

  return null; // unreachable
}

/**
 * Returns the set of room IDs reachable within `depth` hops from `startId`.
 */
function getRoomsWithinDepth(world, startId, depth) {
  const result = new Set();
  result.add(startId);
  let frontier = [startId];

  for (let d = 0; d < depth; d++) {
    const nextFrontier = [];
    for (const roomId of frontier) {
      const connections = world.getRoomConnections(roomId);
      for (const next of connections) {
        if (!result.has(next)) {
          result.add(next);
          nextFrontier.push(next);
        }
      }
    }
    frontier = nextFrontier;
    if (frontier.length === 0) break;
  }

  return result;
}

// ── Per-enemy AI state ───────────────────────────────────────────────────────

const AI_STATE = {
  IDLE: 'idle',
  WANDER: 'wander',
  CHASE: 'chase',
  RETURN: 'return',
};

function createEnemyAIState(enemy, homeZone, aggroDepth) {
  const stableHash = enemy?.mesh?.id ?? 0;
  return {
    state: AI_STATE.IDLE,
    homeZone,
    aggroDepth,
    aggroRooms: null,         // lazily built Set of room IDs
    currentRoomId: homeZone,  // enemy's current room
    wanderTarget: null,       // Vector3 — current wander destination
    wanderPauseTimer: 0,      // seconds to idle before next wander
    roomPath: null,           // array of room IDs toward player
    roomPathIndex: 0,         // which room in the path we're steering toward
    steerTarget: new THREE.Vector3(), // immediate steering destination
    decisionTimer: 0,         // time until next aggro/state re-evaluation
    wasKnockedBack: false,    // set by runtime when knockback ends
    timeSincePlayerSeen: 0,   // for delayed de-aggro (leash cooldown)
    forwardBlockedTimer: 0,   // accumulates while forward clearance fails
    recoveryTimer: 0,         // temporary sidestep/reverse timer
    recoveryDirection: new THREE.Vector3(),
    recoveryCooldownTimer: 0,
    recoverySideBias: (stableHash % 2 === 0) ? -1 : 1,
    stallTimer: 0,
    recentMoveSpeed: 0,
    lastPosition: new THREE.Vector3(),
  };
}

// ── Tuning constants ─────────────────────────────────────────────────────────

const DECISION_INTERVAL = 0.35;      // seconds between aggro checks
const WANDER_PAUSE_MIN = 1.5;        // min idle between wander legs
const WANDER_PAUSE_MAX = 4.0;        // max idle between wander legs
const WANDER_ARRIVE_DIST = 0.4;      // close enough to wander target
const CHASE_ARRIVE_DIST = 1.2;       // attack range — stop steering
const RETURN_ARRIVE_DIST = 1.0;      // close enough to home center
const LEASH_COOLDOWN = 2.0;          // seconds after leaving aggro zone before de-aggro
const FACING_BLEND = 4.0;            // radians/sec for rotation toward movement

const NAV_PROBE_DISTANCE = 0.65;
const NAV_CLEARANCE_PADDING = 0.02;
const NAV_MIN_CLEARANCE_RATIO = 0.12;
const NAV_STEER_ANGLE_STEP = 0.35;
const NAV_STEER_MAX_ANGLE = 1.4;

// ── Main AI update ───────────────────────────────────────────────────────────

/**
 * Creates the enemy AI system.
 * Call `register(enemy)` for each enemy, then `update(dt)` each frame.
 */
export function createEnemyAI(world, roomCulling) {
  const aiStates = new Map(); // enemy → AIState

  function ensureNavigationConfig(enemy, pathing) {
    if (!pathing) return null;

    const col = enemy.components?.collision;
    const halfSize = col?.halfSize;
    const defaultRadius = halfSize ? Math.max(halfSize.x, halfSize.z) : 0.28;

    if (!pathing.navigation) {
      pathing.navigation = {};
    }

    const nav = pathing.navigation;
    nav.radius = nav.radius ?? defaultRadius;
    nav.probeDistance = nav.probeDistance ?? Math.max(NAV_PROBE_DISTANCE, nav.radius * 2.2);
    nav.clearancePadding = nav.clearancePadding ?? NAV_CLEARANCE_PADDING;
    nav.minClearanceRatio = nav.minClearanceRatio ?? NAV_MIN_CLEARANCE_RATIO;
    nav.steerAngleStep = nav.steerAngleStep ?? NAV_STEER_ANGLE_STEP;
    nav.maxSteerAngle = nav.maxSteerAngle ?? NAV_STEER_MAX_ANGLE;

    return nav;
  }

  function intersectsWorldAtPosition(enemy, x, z, extraPadding = 0) {
    const col = enemy.components?.collision;
    if (!col || !col.halfSize || !col.box) return false;

    const colliders = world.colliders;
    if (!colliders || colliders.length === 0) return false;

    const hs = col.halfSize;
    const footY = col.footOffsetY || 0;

    const eMinX = x - hs.x - extraPadding;
    const eMaxX = x + hs.x + extraPadding;
    const eMinY = footY;
    const eMaxY = footY + hs.y * 2;
    const eMinZ = z - hs.z - extraPadding;
    const eMaxZ = z + hs.z + extraPadding;

    for (let i = 0; i < colliders.length; i++) {
      const box = colliders[i];
      if (box === col.box) continue;
      if (enemy.type === 'spider' && box._enemyCollider && box._enemyEntity && box._enemyEntity !== enemy) {
        continue;
      }

      if (
        eMinX >= box.max.x || eMaxX <= box.min.x ||
        eMinY >= box.max.y || eMaxY <= box.min.y ||
        eMinZ >= box.max.z || eMaxZ <= box.min.z
      ) {
        continue;
      }

      return true;
    }

    return false;
  }

  function hasForwardClearance(enemy, dir, probeDistance, padding) {
    if (dir.lengthSq() < 0.0001) return true;

    const col = enemy.components?.collision;
    const hs = col?.halfSize;
    if (!col || !hs) return true;

    const pos = enemy.mesh.position;
    const step = Math.max(0.18, Math.max(hs.x, hs.z) * 0.7);

    for (let d = step; d <= probeDistance; d += step) {
      const sx = pos.x + dir.x * d;
      const sz = pos.z + dir.z * d;
      if (intersectsWorldAtPosition(enemy, sx, sz, padding)) {
        return false;
      }
    }

    return true;
  }

  function getClearanceRatio(enemy, dir, probeDistance, padding) {
    if (dir.lengthSq() < 0.0001) return 0;

    const col = enemy.components?.collision;
    const hs = col?.halfSize;
    if (!col || !hs) return 1;

    const pos = enemy.mesh.position;
    const step = Math.max(0.16, Math.max(hs.x, hs.z) * 0.65);

    for (let d = step; d <= probeDistance; d += step) {
      const sx = pos.x + dir.x * d;
      const sz = pos.z + dir.z * d;
      if (intersectsWorldAtPosition(enemy, sx, sz, padding)) {
        return Math.max(0, (d - step) / probeDistance);
      }
    }

    return 1;
  }

  function rotateDirXZ(dir, angle, out) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    out.set(
      dir.x * c - dir.z * s,
      0,
      dir.x * s + dir.z * c
    );
    return out.normalize();
  }

  function computeSteerDirection(enemy, ai, desiredDir, nav, outDir) {
    const step = nav.steerAngleStep;
    const maxAngle = nav.maxSteerAngle;
    const sideBias = ai.recoverySideBias;

    const angles = [0];
    for (let a = step; a <= maxAngle + 0.001; a += step) {
      const primary = sideBias < 0 ? -a : a;
      const secondary = -primary;
      angles.push(primary, secondary);
    }
    angles.push(Math.PI);

    let bestScore = -Infinity;
    let bestAngle = 0;
    let found = false;

    for (let i = 0; i < angles.length; i++) {
      const angle = angles[i];
      rotateDirXZ(desiredDir, angle, _candidate);

      const clearance = getClearanceRatio(enemy, _candidate, nav.probeDistance, nav.clearancePadding);
      if (clearance < nav.minClearanceRatio) continue;

      const align = _candidate.dot(desiredDir);
      const sideBonus = Math.sign(angle) === Math.sign(sideBias) ? 0.04 : 0;
      const score = align * 1.35 + clearance * 1.75 + sideBonus;

      if (score > bestScore) {
        bestScore = score;
        bestAngle = angle;
        _best.copy(_candidate);
        found = true;
      }
    }

    if (!found) return false;

    if (bestAngle > 0.08) ai.recoverySideBias = 1;
    else if (bestAngle < -0.08) ai.recoverySideBias = -1;

    outDir.copy(_best);
    return true;
  }

  function register(enemy) {
    const pathing = enemy.components.pathing;
    ensureNavigationConfig(enemy, pathing);
    const homeZone = pathing.homeZone || 'lobby';
    const aggroDepth = pathing.aggroDepth ?? 2;
    const aiState = createEnemyAIState(enemy, homeZone, aggroDepth);
    aiState.lastPosition.copy(enemy.mesh.position);

    // Pre-compute aggro rooms
    aiState.aggroRooms = getRoomsWithinDepth(world, homeZone, aggroDepth);

    aiStates.set(enemy, aiState);
  }

  function unregister(enemy) {
    aiStates.delete(enemy);
  }

  /**
   * Pick a random walkable point inside a room's bounds (floor-level XZ).
   * Insets from walls to avoid immediate collider pushback.
   */
  function randomPointInRoom(roomId, out) {
    const bounds = world.getRoomBounds(roomId);
    if (!bounds) return out.set(0, 0, 0);

    const inset = 0.6; // avoid walls
    const minX = bounds.min.x + inset;
    const maxX = bounds.max.x - inset;
    const minZ = bounds.min.z + inset;
    const maxZ = bounds.max.z - inset;

    out.set(
      minX + Math.random() * (maxX - minX),
      0,
      minZ + Math.random() * (maxZ - minZ)
    );
    return out;
  }

  /**
   * Get the center of a room on the XZ plane.
   */
  function roomCenter(roomId, out) {
    const bounds = world.getRoomBounds(roomId);
    if (!bounds) return out.set(0, 0, 0);
    bounds.getCenter(out);
    out.y = 0;
    return out;
  }

  /**
   * Resolve which room an enemy is currently standing in.
   */
  function resolveEnemyRoom(enemy, ai) {
    const pos = enemy.mesh.position;
    const roomId = world.getRoomAtPosition(pos, 0.3, ai.currentRoomId);
    if (roomId) ai.currentRoomId = roomId;
    return ai.currentRoomId;
  }

  // ── State transitions ──────────────────────────────────────────────────────

  function enterIdle(ai) {
    ai.state = AI_STATE.IDLE;
    ai.wanderPauseTimer = WANDER_PAUSE_MIN + Math.random() * (WANDER_PAUSE_MAX - WANDER_PAUSE_MIN);
    ai.forwardBlockedTimer = 0;
    ai.recoveryTimer = 0;
    ai.recoveryCooldownTimer = 0;
    ai.stallTimer = 0;
  }

  function enterWander(ai) {
    ai.state = AI_STATE.WANDER;
    ai.wanderTarget = ai.wanderTarget || new THREE.Vector3();
    randomPointInRoom(ai.homeZone, ai.wanderTarget);
    ai.forwardBlockedTimer = 0;
    ai.recoveryTimer = 0;
    ai.recoveryCooldownTimer = 0;
    ai.stallTimer = 0;
  }

  function enterChase(ai, playerRoomId) {
    ai.state = AI_STATE.CHASE;
    ai.timeSincePlayerSeen = 0;
    ai.forwardBlockedTimer = 0;
    ai.recoveryTimer = 0;
    ai.recoveryCooldownTimer = 0;
    ai.stallTimer = 0;
    updateChasePath(ai, playerRoomId);
  }

  function enterReturn(ai) {
    ai.state = AI_STATE.RETURN;
    roomCenter(ai.homeZone, ai.steerTarget);
    ai.forwardBlockedTimer = 0;
    ai.recoveryTimer = 0;
    ai.recoveryCooldownTimer = 0;
    ai.stallTimer = 0;
  }

  // ── Chase path computation ─────────────────────────────────────────────────

  function updateChasePath(ai, playerRoomId) {
    ai.roomPath = findRoomPath(world, ai.currentRoomId, playerRoomId);
    ai.roomPathIndex = 0;
  }

  /**
   * Get the next steering target along the room path toward the player.
   * If we're in the same room as the player, steer directly to them.
   * Otherwise, steer toward the center of the next room in the path
   * (which funnels us through doorways).
   */
  function getChaseSteerTarget(ai, playerPosition) {
    if (!ai.roomPath || ai.roomPath.length === 0) {
      ai.steerTarget.copy(playerPosition);
      ai.steerTarget.y = 0;
      return;
    }

    // Advance path index if we've entered the next room
    while (
      ai.roomPathIndex < ai.roomPath.length - 1 &&
      ai.currentRoomId === ai.roomPath[ai.roomPathIndex]
    ) {
      ai.roomPathIndex++;
    }

    // In the same room as the player? Steer directly.
    const targetRoomId = ai.roomPath[ai.roomPath.length - 1];
    if (ai.currentRoomId === targetRoomId) {
      ai.steerTarget.copy(playerPosition);
      ai.steerTarget.y = 0;
      return;
    }

    // Otherwise steer toward the next room's center (doorway funnel)
    const nextRoom = ai.roomPath[Math.min(ai.roomPathIndex, ai.roomPath.length - 1)];
    roomCenter(nextRoom, ai.steerTarget);
  }

  // ── Per-enemy frame update ─────────────────────────────────────────────────

  function updateEnemy(enemy, ai, dt, playerPosition) {
    const pathing = enemy.components.pathing;
    const health = enemy.components.health;
    const pos = enemy.mesh.position;

    // Dead enemies don't think
    if (health && health.dead) {
      pathing.desiredVelocity.set(0, 0, 0);
      pathing.mode = 'none';
      return;
    }

    // Resolve current room
    resolveEnemyRoom(enemy, ai);

    if (dt > 0) {
      const frameDist = ai.lastPosition.distanceTo(pos);
      ai.recentMoveSpeed = frameDist / dt;
      ai.lastPosition.copy(pos);
    }

    if (ai.recoveryCooldownTimer > 0) {
      ai.recoveryCooldownTimer = Math.max(0, ai.recoveryCooldownTimer - dt);
    }

    // Post-knockback recovery: immediately re-evaluate
    if (ai.wasKnockedBack) {
      ai.wasKnockedBack = false;
      ai.decisionTimer = 0; // force immediate re-evaluation
    }

    // Periodic decision tick
    ai.decisionTimer -= dt;
    if (ai.decisionTimer <= 0) {
      ai.decisionTimer = DECISION_INTERVAL;
      evaluateState(enemy, ai, playerPosition);
    }

    // Execute current behavior
    switch (ai.state) {
      case AI_STATE.IDLE:
        executeIdle(enemy, ai, dt, pathing);
        break;
      case AI_STATE.WANDER:
        executeWander(enemy, ai, dt, pathing);
        break;
      case AI_STATE.CHASE:
        executeChase(enemy, ai, dt, pathing, playerPosition);
        break;
      case AI_STATE.RETURN:
        executeReturn(enemy, ai, dt, pathing);
        break;
    }
  }

  // ── State evaluation (runs every DECISION_INTERVAL) ────────────────────────

  function evaluateState(enemy, ai, playerPosition) {
    const playerRoomId = roomCulling.getCurrentRoomId();
    const playerInAggroZone = ai.aggroRooms.has(playerRoomId);

    if (playerInAggroZone) {
      ai.timeSincePlayerSeen = 0;

      if (ai.state !== AI_STATE.CHASE) {
        enterChase(ai, playerRoomId);
      } else {
        // Refresh path in case player moved rooms
        updateChasePath(ai, playerRoomId);
      }
    } else {
      // Player outside aggro zone
      if (ai.state === AI_STATE.CHASE) {
        ai.timeSincePlayerSeen += DECISION_INTERVAL;
        if (ai.timeSincePlayerSeen >= LEASH_COOLDOWN) {
          enterReturn(ai);
        }
      } else if (ai.state === AI_STATE.RETURN) {
        // Check if we're home
        const pos = enemy.mesh.position;
        roomCenter(ai.homeZone, _center);
        _v.set(pos.x - _center.x, 0, pos.z - _center.z);
        if (_v.lengthSq() < RETURN_ARRIVE_DIST * RETURN_ARRIVE_DIST) {
          enterIdle(ai);
        }
      }
    }
  }

  // ── Behavior executors ─────────────────────────────────────────────────────

  function executeIdle(enemy, ai, dt, pathing) {
    pathing.desiredVelocity.set(0, 0, 0);
    pathing.mode = 'none';

    ai.wanderPauseTimer -= dt;
    if (ai.wanderPauseTimer <= 0) {
      enterWander(ai);
    }
  }

  function executeWander(enemy, ai, dt, pathing) {
    const pos = enemy.mesh.position;
    if (!ai.wanderTarget) {
      enterIdle(ai);
      return;
    }

    _v.set(ai.wanderTarget.x - pos.x, 0, ai.wanderTarget.z - pos.z);
    const dist = _v.length();

    if (dist < WANDER_ARRIVE_DIST) {
      enterIdle(ai);
      return;
    }

    // Steer toward wander target at reduced speed
    _v.divideScalar(dist); // normalize
    const wanderSpeed = pathing.moveSpeed * 0.4;
    pathing.desiredVelocity.set(_v.x * wanderSpeed, 0, _v.z * wanderSpeed);
    pathing.mode = 'wander';

    // Face movement direction
    faceDirection(enemy, _v, dt, pathing.turnSpeed);
  }

  function executeChase(enemy, ai, dt, pathing, playerPosition) {
    const nav = ensureNavigationConfig(enemy, pathing);
    const isSpider = enemy.type === 'spider';

    getChaseSteerTarget(ai, playerPosition);

    const pos = enemy.mesh.position;
    _v.set(ai.steerTarget.x - pos.x, 0, ai.steerTarget.z - pos.z);
    const dist = _v.length();

    // In attack range? Stop and face player.
    if (dist < CHASE_ARRIVE_DIST && ai.currentRoomId === ai.roomPath?.[ai.roomPath.length - 1]) {
      pathing.desiredVelocity.set(0, 0, 0);
      pathing.mode = 'chase';
      // Face player
      _v.set(playerPosition.x - pos.x, 0, playerPosition.z - pos.z);
      if (_v.lengthSq() > 0.001) {
        _v.normalize();
        faceDirection(enemy, _v, dt, pathing.turnSpeed);
      }
      return;
    }

    if (dist > 0.01) {
      _v.divideScalar(dist);
      if (isSpider) {
        // Spiders must push directly into blockers so runtime collision can
        // transition them onto walls/ceilings.
        ai.recoveryDirection.copy(_v);
        pathing.desiredVelocity.set(
          ai.recoveryDirection.x * pathing.moveSpeed,
          0,
          ai.recoveryDirection.z * pathing.moveSpeed
        );
      } else {
        const hasSteer = computeSteerDirection(enemy, ai, _v, nav, ai.recoveryDirection);
        if (!hasSteer) {
          pathing.desiredVelocity.set(0, 0, 0);
          pathing.mode = 'chase';
          ai.decisionTimer = Math.min(ai.decisionTimer, 0.05);
          return;
        }

        pathing.desiredVelocity.set(
          ai.recoveryDirection.x * pathing.moveSpeed,
          0,
          ai.recoveryDirection.z * pathing.moveSpeed
        );
        faceDirection(enemy, ai.recoveryDirection, dt, pathing.turnSpeed);
      }
    } else {
      pathing.desiredVelocity.set(0, 0, 0);
    }
    pathing.mode = 'chase';
  }

  function executeReturn(enemy, ai, dt, pathing) {
    const pos = enemy.mesh.position;
    _v.set(ai.steerTarget.x - pos.x, 0, ai.steerTarget.z - pos.z);
    const dist = _v.length();

    if (dist < RETURN_ARRIVE_DIST) {
      enterIdle(ai);
      return;
    }

    _v.divideScalar(dist);
    const returnSpeed = pathing.moveSpeed * 0.6;
    pathing.desiredVelocity.set(_v.x * returnSpeed, 0, _v.z * returnSpeed);
    pathing.mode = 'wander';

    faceDirection(enemy, _v, dt, pathing.turnSpeed);
  }

  // ── Rotation helper ────────────────────────────────────────────────────────

  function faceDirection(enemy, dir, dt, turnSpeed) {
    if (enemy.type === 'spider') return;

    const targetAngle = Math.atan2(dir.x, dir.z);
    let current = enemy.mesh.rotation.y;
    let delta = targetAngle - current;

    // Wrap to [-PI, PI]
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;

    const maxTurn = turnSpeed * dt;
    if (Math.abs(delta) > maxTurn) {
      delta = Math.sign(delta) * maxTurn;
    }

    enemy.mesh.rotation.y = current + delta;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  function update(dt, playerPosition) {
    for (const [enemy, ai] of aiStates) {
      updateEnemy(enemy, ai, dt, playerPosition);
    }
  }

  /**
   * Called by enemyRuntime when knockback on an enemy ends.
   * Forces immediate re-evaluation so the enemy snaps back to pursuing.
   */
  function notifyKnockbackEnd(enemy) {
    const ai = aiStates.get(enemy);
    if (ai) ai.wasKnockedBack = true;
  }

  function getAIState(enemy) {
    return aiStates.get(enemy) || null;
  }

  return {
    register,
    unregister,
    update,
    notifyKnockbackEnd,
    getAIState,
  };
}
