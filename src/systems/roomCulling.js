export function createRoomCulling(world, player, worldItems = null, options = {}) {
  let visibilityDepth = options.visibilityDepth ?? 1;
  const boundaryPadding = options.boundaryPadding ?? 0.2;
  let roomOpsPerFrame = Math.max(1, Number(options.roomOpsPerFrame ?? 2) || 2);
  const onVisibilityChange = typeof options.onVisibilityChange === 'function'
    ? options.onVisibilityChange
    : null;

  let roomIds = world.getRoomIds ? world.getRoomIds() : [];
  let knownRoomIdSet = new Set(roomIds);
  let currentRoomId = roomIds[0] ?? null;
  let desiredVisibleSet = new Set(roomIds);
  const appliedVisibleSet = new Set(roomIds);
  let lastVisibilitySignature = '';
  let scanCursor = 0;

  function syncRoomTopology() {
    const latestRoomIds = world.getRoomIds ? world.getRoomIds() : roomIds;
    roomIds = Array.isArray(latestRoomIds) ? latestRoomIds.slice() : [];

    const roomIdSet = new Set(roomIds);

    for (const roomId of Array.from(desiredVisibleSet)) {
      if (!roomIdSet.has(roomId)) {
        desiredVisibleSet.delete(roomId);
      }
    }

    for (const roomId of Array.from(appliedVisibleSet)) {
      if (!roomIdSet.has(roomId)) {
        appliedVisibleSet.delete(roomId);
      }
    }

    // Only initialize truly new rooms that appeared in the world since the last sync.
    for (const roomId of roomIds) {
      if (!knownRoomIdSet.has(roomId)) {
        desiredVisibleSet.add(roomId);
        appliedVisibleSet.add(roomId);
      }
    }

    knownRoomIdSet = roomIdSet;

    if (currentRoomId && !roomIdSet.has(currentRoomId)) {
      currentRoomId = roomIds[0] ?? null;
      lastVisibilitySignature = '';
    }

    if (roomIds.length === 0) {
      currentRoomId = null;
      scanCursor = 0;
      lastVisibilitySignature = '';
      return;
    }

    if (scanCursor >= roomIds.length) {
      scanCursor = 0;
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

  function collectVisibleRooms(originRoomId) {
    const result = new Set();
    if (!originRoomId) return result;

    const queue = [{ roomId: originRoomId, depth: 0 }];
    let queueIndex = 0;
    result.add(originRoomId);

    while (queueIndex < queue.length) {
      const node = queue[queueIndex++];
      if (!node || node.depth >= visibilityDepth) continue;

      const connections = world.getRoomConnections
        ? world.getRoomConnections(node.roomId)
        : [];

      for (const connectedRoomId of connections) {
        if (result.has(connectedRoomId)) continue;
        result.add(connectedRoomId);
        queue.push({ roomId: connectedRoomId, depth: node.depth + 1 });
      }
    }

    return result;
  }

  function applyRoomVisibility(roomId, isVisible) {
    const wasVisible = appliedVisibleSet.has(roomId);

    if (world.setRoomVisibility) {
      world.setRoomVisibility(roomId, isVisible);
    }
    if (worldItems && worldItems.setRoomVisibility) {
      worldItems.setRoomVisibility(roomId, isVisible);
    }

    if (isVisible) {
      appliedVisibleSet.add(roomId);
    } else {
      appliedVisibleSet.delete(roomId);
    }

    if (onVisibilityChange && wasVisible !== isVisible) {
      onVisibilityChange(roomId, isVisible);
    }
  }

  function processVisibilityChanges() {
    syncRoomTopology();
    if (roomIds.length === 0 || roomOpsPerFrame <= 0) return;

    let ops = 0;
    const total = roomIds.length;

    // Never allow the player's current room to remain hidden behind queue order.
    if (currentRoomId && desiredVisibleSet.has(currentRoomId) && !appliedVisibleSet.has(currentRoomId)) {
      applyRoomVisibility(currentRoomId, true);
      ops += 1;
      if (ops >= roomOpsPerFrame) return;
    }

    for (let pass = 0; pass < 2 && ops < roomOpsPerFrame; pass++) {
      for (let i = 0; i < total && ops < roomOpsPerFrame; i++) {
        const idx = (scanCursor + i) % total;
        const roomId = roomIds[idx];
        const wantsVisible = desiredVisibleSet.has(roomId);
        const isVisible = appliedVisibleSet.has(roomId);

        if (wantsVisible === isVisible) continue;
        if (pass === 0 && !wantsVisible) continue;
        if (pass === 1 && wantsVisible) continue;

        applyRoomVisibility(roomId, wantsVisible);
        scanCursor = (idx + 1) % total;
        ops += 1;
      }
    }
  }

  function getPendingVisibilityChanges() {
    syncRoomTopology();
    let pending = 0;
    for (const roomId of roomIds) {
      if (desiredVisibleSet.has(roomId) !== appliedVisibleSet.has(roomId)) {
        pending += 1;
      }
    }
    return pending;
  }

  function update() {
    syncRoomTopology();
    const resolvedRoomId = resolveCurrentRoom();
    const nextVisibleSet = collectVisibleRooms(resolvedRoomId);
    const signature = Array.from(nextVisibleSet).sort().join('|');
    desiredVisibleSet = nextVisibleSet;

    if (signature !== lastVisibilitySignature) {
      const currentIndex = roomIds.indexOf(currentRoomId);
      if (currentIndex >= 0) {
        scanCursor = currentIndex;
      }
    }

    lastVisibilitySignature = signature;

    processVisibilityChanges();
  }

  function getStats() {
    syncRoomTopology();
    const roomMeta = world.getRoomMeta ? world.getRoomMeta(currentRoomId) : null;
    return {
      currentRoomId,
      currentRoomLabel: roomMeta ? roomMeta.label : currentRoomId,
      currentZone: roomMeta ? roomMeta.zone : null,
      visibleRooms: appliedVisibleSet.size,
      totalRooms: roomIds.length,
      pendingVisibilityChanges: getPendingVisibilityChanges(),
      roomOpsPerFrame,
    };
  }

  function setVisibilityDepth(nextDepth) {
    const parsedDepth = Number(nextDepth);
    const clampedDepth = Number.isFinite(parsedDepth) ? Math.max(0, Math.floor(parsedDepth)) : 0;
    if (clampedDepth === visibilityDepth) return;
    visibilityDepth = clampedDepth;
    lastVisibilitySignature = '';
  }

  function setRoomOpsPerFrame(nextValue) {
    const parsed = Number(nextValue);
    if (!Number.isFinite(parsed)) return;
    roomOpsPerFrame = Math.max(1, Math.floor(parsed));
  }

  function getRoomOpsPerFrame() {
    return roomOpsPerFrame;
  }

  function getVisibilityDepth() {
    return visibilityDepth;
  }

  update();

  return {
    update,
    getStats,
    setVisibilityDepth,
    getVisibilityDepth,
    setRoomOpsPerFrame,
    getRoomOpsPerFrame,
    getPendingVisibilityChanges,
    getCurrentRoomId: () => currentRoomId,
  };
}
