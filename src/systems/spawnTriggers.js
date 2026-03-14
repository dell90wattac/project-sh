/**
 * Spawn Trigger System
 *
 * Fires enemy spawns in response to game events:
 *   - 'playerZone'  : player enters a named room
 *   - 'doorOpen'    : a door swings past an angle threshold
 *   - 'enemyDeath'  : a specific enemy's health.dead flag becomes true
 *
 * Trigger options:
 *   oneShot: true  (default) — fires once per session, re-arms on reset()
 *   oneShot: false           — re-fires each time the condition transitions false→true
 *   enabled: true  (default) — set to false to suppress a trigger until needed
 *   onFire(triggers)         — optional callback after spawning; receives full trigger array
 */

import * as THREE from 'three';
import { createSpider } from '../entities/zombies.js';

const SPIDER_HALF = new THREE.Vector3(0.13, 0.12, 0.13);
const SPIDER_FOOT = 0.03;

const DOOR_OPEN_THRESHOLD = 0.3; // radians

export function createSpawnTriggers({ world, enemyAI, player, doorSystems, onEnemySpawned }) {
  const triggers = [];

  // ── Public: register a trigger ────────────────────────────────────────────
  function addTrigger(def) {
    triggers.push(Object.assign({
      enabled:         true,
      oneShot:         true,
      _fired:          false,
      _prevInZone:     false,
      _prevDoorOpen:   false,
      _prevEnemyDead:  false,
    }, def));
  }

  // ── Internal: spawn one spider from a spawn definition ───────────────────
  function spawnSpider(spawnDef) {
    const spider = createSpider();
    const pos = new THREE.Vector3(spawnDef.x, spawnDef.y, spawnDef.z);
    spider.mesh.position.copy(pos);
    spider._spawnPos = pos.clone();

    if (spawnDef.wallNormal) {
      spider.components.surface.normal.copy(spawnDef.wallNormal);
      spider._spawnNormal = spawnDef.wallNormal.clone();
    }

    // Add to world: scene + collider + enemies array (runtime picks up next frame)
    world.addEnemy(spider, SPIDER_HALF, SPIDER_FOOT);

    // Register with AI system (Map accepts new entries at any time)
    enemyAI.register(spider);

    // Notify main.js to register with shockwave system
    if (onEnemySpawned) onEnemySpawned(spider);
  }

  // ── Public: evaluate all triggers each frame ──────────────────────────────
  function update() {
    const playerPos  = player.getPosition();
    const playerRoom = world.getRoomAtPosition(playerPos, 0.2) ?? 'lobby';

    for (const t of triggers) {
      if (!t.enabled) continue;
      if (t.oneShot && t._fired) continue;

      let fire = false;

      if (t.type === 'playerZone') {
        const inZone = playerRoom === t.roomId;
        fire        = inZone && !t._prevInZone; // edge: entered zone this frame
        t._prevInZone = inZone;

      } else if (t.type === 'doorOpen') {
        const entry  = doorSystems?.find(d => d.id === t.doorId);
        const angle  = Math.abs(entry?.system.getInteraction().doorAngle ?? 0);
        const isOpen = angle > DOOR_OPEN_THRESHOLD;
        fire           = isOpen && !t._prevDoorOpen;
        t._prevDoorOpen = isOpen;

      } else if (t.type === 'enemyDeath') {
        const dead       = t.watchEnemy?.components.health?.dead === true;
        fire             = dead && !t._prevEnemyDead;
        t._prevEnemyDead = dead;
      }

      if (!fire) continue;

      for (const spawnDef of t.spawns) spawnSpider(spawnDef);
      if (t.oneShot) t._fired = true;
      if (t.onFire) t.onFire(triggers);
    }
  }

  // ── Public: re-arm all triggers (called by resetGame) ────────────────────
  function reset() {
    for (const t of triggers) {
      t._fired         = false;
      t._prevInZone    = false;
      t._prevDoorOpen  = false;
      t._prevEnemyDead = false;
    }
  }

  return { addTrigger, update, reset };
}
