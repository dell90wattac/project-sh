export function createPerfOverlay(options = {}) {
  const buildVersion = options.buildVersion || '0.0';

  const panel = document.createElement('div');
  panel.id = 'perf-overlay';
  panel.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    z-index: 120;
    padding: 8px 10px;
    color: #b8ffba;
    background: rgba(0, 0, 0, 0.58);
    border: 1px solid rgba(184, 255, 186, 0.28);
    border-radius: 4px;
    font-family: monospace;
    font-size: 12px;
    line-height: 1.35;
    letter-spacing: 0.02em;
    pointer-events: none;
    white-space: pre;
  `;

  const uiRoot = document.getElementById('ui-root') || document.body;
  uiRoot.appendChild(panel);

  let visible = true;
  let smoothedMs = 16.7;
  let updateAccumulator = 0;

  window.addEventListener('keydown', (event) => {
    if (event.code !== 'F3') return;
    visible = !visible;
    panel.style.display = visible ? 'block' : 'none';
  });

  function update(dt, stats = {}) {
    if (!visible) return;

    const frameMs = dt * 1000;
    smoothedMs += (frameMs - smoothedMs) * 0.08;

    updateAccumulator += dt;
    if (updateAccumulator < 0.12) return;
    updateAccumulator = 0;

    const fps = smoothedMs > 0 ? (1000 / smoothedMs) : 0;
    const lines = [
      `fps ${fps.toFixed(1)}  ms ${smoothedMs.toFixed(2)}`,
      `rooms ${stats.visibleRooms ?? '-'} / ${stats.totalRooms ?? '-'}`,
      `vis queue ${stats.pendingVisibilityChanges ?? 0}`,
      `mesh ops ${stats.meshOpsPerFrame ?? '-'}`,
      `room ${stats.currentRoomLabel ?? stats.currentRoomId ?? '-'}`,
      `zone ${stats.currentZone ?? '-'}`,
      `calls ${stats.drawCalls ?? '-'}  tris ${stats.triangles ?? '-'}`,
      `session ${buildVersion} | F3 hide/show`,
    ];

    panel.textContent = lines.join('\n');
  }

  function destroy() {
    panel.remove();
  }

  return {
    update,
    destroy,
  };
}
