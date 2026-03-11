import * as THREE from 'three';

/**
 * Lightweight enemy runtime orchestrator.
 * Owns per-frame controller updates, animation state plumbing, and collider sync.
 */
export function createEnemyRuntime(world, player) {
  const scratchPlayerPos = new THREE.Vector3();

  function getEnemies() {
    if (world.getEnemies) return world.getEnemies();
    if (Array.isArray(world.enemies)) return world.enemies;
    return [];
  }

  function update(dt) {
    const enemies = getEnemies();
    if (!enemies || enemies.length === 0) return;

    if (player && player.getPosition) {
      scratchPlayerPos.copy(player.getPosition());
    }

    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      if (!enemy || !enemy.components) continue;

      const { controller, animation, collision } = enemy.components;

      if (animation && animation.state !== 'death' && enemy.components.health?.dead) {
        animation.state = 'death';
      }

      if (controller && typeof controller.update === 'function') {
        controller.update(dt, {
          enemy,
          playerPosition: scratchPlayerPos,
          world,
        });
      }

      if (collision && typeof collision.syncFromEntity === 'function') {
        collision.syncFromEntity(enemy);
      }
    }
  }

  return {
    update,
  };
}
