// Simple debug menu UI (toggleable) for dev/testing.
// Keeps the API similar-ish to inventory UI: toggle(), isOpen(), update().

export function createDebugMenuUI(bindings = {}) {
  let open = false;
  let toggleCb = null;

  // Bindings are pluggable so main can create the menu before player exists.
  let getNoclipEnabled = bindings.getNoclipEnabled || (() => false);
  let setNoclipEnabled = bindings.setNoclipEnabled || (() => {});
  let getInvincibleEnabled = bindings.getInvincibleEnabled || (() => false);
  let setInvincibleEnabled = bindings.setInvincibleEnabled || (() => {});
  let getLeaveHitboxEnabled = bindings.getLeaveHitboxEnabled || (() => false);
  let setLeaveHitboxEnabled = bindings.setLeaveHitboxEnabled || (() => {});

  const uiRoot = document.getElementById('ui-root') || document.body;
  const container = document.createElement('div');
  container.id = 'debug-menu';
  container.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 220;
    display: none;
    pointer-events: none;
    font-family: monospace;
  `;

  const panel = document.createElement('div');
  panel.style.cssText = `
    position: absolute;
    top: 12%;
    left: 50%;
    transform: translateX(-50%);
    width: min(520px, calc(100vw - 24px));
    background: rgba(10, 10, 10, 0.88);
    border: 1px solid rgba(155, 229, 255, 0.55);
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
    color: #9be5ff;
    padding: 14px 14px 10px 14px;
    letter-spacing: 0.06em;
    pointer-events: auto;
  `;
  container.appendChild(panel);

  const title = document.createElement('div');
  title.textContent = 'DEBUG MENU';
  title.style.cssText = `
    font-weight: 800;
    font-size: 14px;
    margin-bottom: 10px;
    text-shadow: 0 0 8px rgba(0,0,0,0.9);
  `;
  panel.appendChild(title);

  function makeRow(label, hotkey) {
    const row = document.createElement('button');
    row.type = 'button';
    row.style.cssText = `
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 10px 10px;
      margin: 0 0 8px 0;
      background: rgba(0, 0, 0, 0.35);
      border: 1px solid rgba(155, 229, 255, 0.25);
      color: inherit;
      cursor: pointer;
      letter-spacing: inherit;
    `;

    const left = document.createElement('div');
    left.style.cssText = `display: flex; align-items: center; gap: 10px;`;
    const check = document.createElement('span');
    check.textContent = '[ ]';
    check.style.cssText = `width: 32px; text-align: left; font-weight: 800;`;
    const text = document.createElement('span');
    text.textContent = label;
    text.style.cssText = `font-weight: 700;`;
    left.appendChild(check);
    left.appendChild(text);

    const right = document.createElement('div');
    right.textContent = hotkey || '';
    right.style.cssText = `opacity: 0.75; font-weight: 700;`;

    row.appendChild(left);
    row.appendChild(right);

    return { row, check };
  }

  const noclipRow = makeRow('NO CLIP', '1');
  const invRow = makeRow('PLAYER INVINCIBLE', '2');
  const leaveHitboxRow = makeRow('LEAVE HITBOX (ENEMY TARGET LOCK, AI ONLY)', '3');
  panel.appendChild(noclipRow.row);
  panel.appendChild(invRow.row);
  panel.appendChild(leaveHitboxRow.row);

  const hint = document.createElement('div');
  hint.textContent = 'ESC CLOSE';
  hint.style.cssText = `opacity: 0.75; font-weight: 700; font-size: 12px; margin-top: 2px;`;
  panel.appendChild(hint);

  function refresh() {
    const noclipOn = !!getNoclipEnabled();
    const invOn = !!getInvincibleEnabled();
    const leaveOn = !!getLeaveHitboxEnabled();
    noclipRow.check.textContent = noclipOn ? '[X]' : '[ ]';
    invRow.check.textContent = invOn ? '[X]' : '[ ]';
    leaveHitboxRow.check.textContent = leaveOn ? '[X]' : '[ ]';
  }

  function setOpen(next) {
    open = !!next;
    container.style.display = open ? 'block' : 'none';
    container.style.pointerEvents = open ? 'auto' : 'none';
    if (open) refresh();
    if (toggleCb) toggleCb(open);
  }

  noclipRow.row.addEventListener('click', () => {
    const next = !getNoclipEnabled();
    setNoclipEnabled(!!next);
    refresh();
  });
  invRow.row.addEventListener('click', () => {
    const next = !getInvincibleEnabled();
    setInvincibleEnabled(!!next);
    refresh();
  });
  leaveHitboxRow.row.addEventListener('click', () => {
    const next = !getLeaveHitboxEnabled();
    setLeaveHitboxEnabled(!!next);
    refresh();
  });

  function onKeyDown(e) {
    if (!open) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.code === 'Digit1') {
      e.preventDefault();
      const next = !getNoclipEnabled();
      setNoclipEnabled(!!next);
      refresh();
      return;
    }
    if (e.code === 'Digit2') {
      e.preventDefault();
      const next = !getInvincibleEnabled();
      setInvincibleEnabled(!!next);
      refresh();
      return;
    }
    if (e.code === 'Digit3') {
      e.preventDefault();
      const next = !getLeaveHitboxEnabled();
      setLeaveHitboxEnabled(!!next);
      refresh();
    }
  }
  window.addEventListener('keydown', onKeyDown);

  uiRoot.appendChild(container);

  return {
    toggle() { setOpen(!open); },
    open() { setOpen(true); },
    close() { setOpen(false); },
    isOpen() { return open; },
    update(/* dt */) {
      // Keep UI in sync if external systems change states.
      if (open) refresh();
    },
    refresh,
    setToggleCallback(fn) { toggleCb = fn; },
    setBindings(nextBindings = {}) {
      if (typeof nextBindings.getNoclipEnabled === 'function') getNoclipEnabled = nextBindings.getNoclipEnabled;
      if (typeof nextBindings.setNoclipEnabled === 'function') setNoclipEnabled = nextBindings.setNoclipEnabled;
      if (typeof nextBindings.getInvincibleEnabled === 'function') getInvincibleEnabled = nextBindings.getInvincibleEnabled;
      if (typeof nextBindings.setInvincibleEnabled === 'function') setInvincibleEnabled = nextBindings.setInvincibleEnabled;
      if (typeof nextBindings.getLeaveHitboxEnabled === 'function') getLeaveHitboxEnabled = nextBindings.getLeaveHitboxEnabled;
      if (typeof nextBindings.setLeaveHitboxEnabled === 'function') setLeaveHitboxEnabled = nextBindings.setLeaveHitboxEnabled;
      refresh();
    },
  };
}
