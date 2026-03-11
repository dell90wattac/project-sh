/**
 * Room tracker — resolves the player's current room for HUD / zone display.
 * Visibility culling is disabled; all rooms remain visible at all times.
 */
export function createRoomCulling(world, player, worldItems = null, options = {}) {
  const boundaryPadding = options.boundaryPadding ?? 0.2;

  let roomIds = world.getRoomIds ? world.getRoomIds() : [];
  let currentRoomId = roomIds[0] ?? null;

  function syncRoomTopology() {
    const latestRoomIds = world.getRoomIds ? world.getRoomIds() : roomIds;
    roomIds = Array.isArray(latestRoomIds) ? latestRoomIds.slice() : [];

    if (currentRoomId && !roomIds.includes(currentRoomId)) {
      currentRoomId = roomIds[0] ?? null;
    }
  }

  function resolveCurrentRoom() {
    if (!world.getRoomAtPosition || !player.getPosition) {
      return currentRoomId;
    }

    const roomId = world.getRoomAtPosition(player.getPosition(), boundaryPadding, currentRoomId);
    if (roomId) {
      currentRoomId = roomId;
    }
    return currentRoomId;
  }

  function update() {
    syncRoomTopology();
    resolveCurrentRoom();
  }

  function getStats() {
    syncRoomTopology();
    const roomMeta = world.getRoomMeta ? world.getRoomMeta(currentRoomId) : null;
    return {
      currentRoomId,
      currentRoomLabel: roomMeta ? roomMeta.label : currentRoomId,
      currentZone: roomMeta ? roomMeta.zone : null,
      visibleRooms: roomIds.length,
      totalRooms: roomIds.length,
      pendingVisibilityChanges: 0,
      meshOpsPerFrame: 0,
    };
  }

  function getPendingVisibilityChanges() {
    return 0;
  }

  // No-op stubs so callers don't need to guard.
  function setVisibilityDepth() {}
  function getVisibilityDepth() { return 0; }
  function setMeshOpsPerFrame() {}
  function getMeshOpsPerFrame() { return 0; }

  update();

  return {
    update,
    getStats,
    setVisibilityDepth,
    getVisibilityDepth,
    setMeshOpsPerFrame,
    getMeshOpsPerFrame,
    getPendingVisibilityChanges,
    getCurrentRoomId: () => currentRoomId,
  };
}
