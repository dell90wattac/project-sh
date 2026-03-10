// ─── Inventory UI ──────────────────────────────────────────────────────────
// 3x3 grid + equipped weapon slot.
// Left-click drag to move/stack/combine items.
// Drag to empty slot: moves. Drag to same stackable type: stacks.
// Drag to item with a recipe: combines. Drag to incompatible: shows error.
// Drag outside inventory panel: drops on ground.
// Right-click slot: context menu (Use, Equip, Drop).

import { getItemDef, getMaxStack, getRecipe, canStack } from '../systems/itemRegistry.js';

export function createInventoryUI(inventory, playerHealth, callbacks) {
  let isOpen = false;
  let onToggle = null;

  // ── Drag state ────────────────────────────────────────────────────────
  let isDragging = false;
  let dragSourceSlot = -1;       // grid slot index, or -1 if from equipped
  let dragSourceIsEquipped = false;
  let dragGhost = null;

  // ── Cannot-drop feedback ──────────────────────────────────────────────
  let cannotTimer = 0;

  // ── Context menu virtual-cursor options ───────────────────────────────
  let menuOptionElements = [];

  // ── Helper: convert color number to CSS hex ───────────────────────────
  function colorToHex(color) {
    return '#' + color.toString(16).padStart(6, '0');
  }

  // ── Cursor ────────────────────────────────────────────────────────────
  const cursor = document.createElement('div');
  cursor.id = 'inventory-cursor';
  cursor.style.cssText = `
    position: fixed;
    width: 20px;
    height: 20px;
    pointer-events: none;
    display: none;
    z-index: 1200;
  `;

  const cursorInner = document.createElement('div');
  cursorInner.style.cssText = `
    width: 100%;
    height: 100%;
    border: 2px solid #00ff00;
    border-radius: 50%;
    box-shadow: 0 0 10px rgba(0, 255, 0, 0.6);
  `;
  cursor.appendChild(cursorInner);

  const cursorCross = document.createElement('div');
  cursorCross.style.cssText = `
    position: absolute;
    width: 6px;
    height: 6px;
    background: #00ff00;
    border-radius: 50%;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    box-shadow: 0 0 5px rgba(0, 255, 0, 0.8);
  `;
  cursor.appendChild(cursorCross);
  document.body.appendChild(cursor);

  let cursorX = window.innerWidth / 2;
  let cursorY = window.innerHeight / 2;
  let cursorNeedsAbsoluteSync = false;

  function applyCursorPosition() {
    cursorX = Math.max(0, Math.min(window.innerWidth, cursorX));
    cursorY = Math.max(0, Math.min(window.innerHeight, cursorY));
    cursor.style.left = (cursorX - 10) + 'px';
    cursor.style.top = (cursorY - 10) + 'px';
    if (isDragging && dragGhost) {
      dragGhost.style.left = cursorX + 'px';
      dragGhost.style.top = cursorY + 'px';
    }
  }

  function setCursorAbsolute(clientX, clientY) {
    cursorX = clientX;
    cursorY = clientY;
    applyCursorPosition();
  }

  function moveCursorByDelta(dx, dy) {
    cursorX += dx;
    cursorY += dy;
    applyCursorPosition();
  }

  function syncCursorFromMouseEvent(e) {
    if (!isOpen) return;

    const pointerLocked = !!document.pointerLockElement;
    if (cursorNeedsAbsoluteSync || !pointerLocked) {
      setCursorAbsolute(e.clientX, e.clientY);
      cursorNeedsAbsoluteSync = false;
      return;
    }

    moveCursorByDelta(e.movementX || 0, e.movementY || 0);
  }

  document.addEventListener('mousemove', e => {
    syncCursorFromMouseEvent(e);
  });

  window.addEventListener('blur', () => {
    cursorNeedsAbsoluteSync = true;
  });

  window.addEventListener('focus', () => {
    cursorNeedsAbsoluteSync = true;
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      cursorNeedsAbsoluteSync = true;
    }
  });

  // ── Container ─────────────────────────────────────────────────────────
  const container = document.createElement('div');
  container.id = 'inventory-ui';
  container.style.cssText = `
    display: none;
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(20, 20, 30, 0.95);
    border: 2px solid #555;
    padding: 20px;
    z-index: 1000;
    pointer-events: auto;
    user-select: none;
    -webkit-user-select: none;
  `;

  // ── Title ─────────────────────────────────────────────────────────────
  const title = document.createElement('div');
  title.textContent = 'INVENTORY';
  title.style.cssText = `
    color: #aaa;
    font-size: 18px;
    font-weight: bold;
    margin-bottom: 15px;
    text-align: center;
    font-family: monospace;
  `;
  container.appendChild(title);

  // ── Equipped Weapon Slot ──────────────────────────────────────────────
  const equippedRow = document.createElement('div');
  equippedRow.style.cssText = `
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 15px;
  `;

  const equippedLabel = document.createElement('div');
  equippedLabel.textContent = 'EQUIPPED';
  equippedLabel.style.cssText = `
    color: #aa8833;
    font-size: 11px;
    font-family: monospace;
    letter-spacing: 0.1em;
    writing-mode: vertical-rl;
    text-orientation: mixed;
  `;

  const equippedSlotDiv = document.createElement('div');
  equippedSlotDiv.style.cssText = `
    position: relative;
    width: 80px;
    height: 80px;
    background: rgba(60, 50, 30, 0.8);
    border: 2px solid #aa8833;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  `;

  const equippedIcon = document.createElement('div');
  equippedIcon.style.cssText = `
    width: 60px;
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: monospace;
    font-size: 20px;
    font-weight: bold;
    color: #fff;
    text-shadow: 0 0 4px rgba(0,0,0,0.8);
    border-radius: 4px;
    opacity: 0;
  `;
  equippedSlotDiv.appendChild(equippedIcon);

  const equippedName = document.createElement('div');
  equippedName.style.cssText = `
    position: absolute;
    top: 2px;
    left: 4px;
    color: #ccc;
    font-size: 8px;
    font-family: monospace;
    display: none;
  `;
  equippedSlotDiv.appendChild(equippedName);

  equippedRow.appendChild(equippedLabel);
  equippedRow.appendChild(equippedSlotDiv);
  container.appendChild(equippedRow);

  // ── Grid (3x3) ───────────────────────────────────────────────────────
  const grid = document.createElement('div');
  grid.style.cssText = `
    display: grid;
    grid-template-columns: repeat(3, 80px);
    gap: 10px;
    margin-bottom: 15px;
  `;
  container.appendChild(grid);

  const uiSlots = [];
  for (let i = 0; i < 9; i++) {
    const slotDiv = document.createElement('div');
    slotDiv.style.cssText = `
      position: relative;
      width: 80px;
      height: 80px;
      background: rgba(50, 50, 60, 0.8);
      border: 1px solid #444;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    `;

    const iconDiv = document.createElement('div');
    iconDiv.style.cssText = `
      width: 60px;
      height: 60px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: monospace;
      font-size: 20px;
      font-weight: bold;
      color: #fff;
      text-shadow: 0 0 4px rgba(0,0,0,0.8);
      border-radius: 4px;
      opacity: 0;
    `;
    slotDiv.appendChild(iconDiv);

    const nameLabel = document.createElement('div');
    nameLabel.style.cssText = `
      position: absolute;
      top: 2px;
      left: 4px;
      color: #aaa;
      font-size: 8px;
      font-family: monospace;
      display: none;
    `;
    slotDiv.appendChild(nameLabel);

    const countText = document.createElement('div');
    countText.style.cssText = `
      position: absolute;
      bottom: 4px;
      right: 5px;
      color: #fff;
      font-size: 12px;
      font-weight: bold;
      font-family: monospace;
      background: rgba(0, 0, 0, 0.6);
      padding: 1px 4px;
      display: none;
    `;
    slotDiv.appendChild(countText);

    grid.appendChild(slotDiv);
    uiSlots.push({ element: slotDiv, iconDiv, nameLabel, countText });
  }

  // ── Info text ─────────────────────────────────────────────────────────
  const infoText = document.createElement('div');
  infoText.textContent = 'Q: close  \u2022  Drag: move/combine  \u2022  Right-click: options';
  infoText.style.cssText = `
    color: #666;
    font-size: 11px;
    text-align: center;
    font-family: monospace;
  `;
  container.appendChild(infoText);

  // ── Cannot-drop label ─────────────────────────────────────────────────
  const cannotLabel = document.createElement('div');
  cannotLabel.style.cssText = `
    color: #ff4444;
    font-size: 12px;
    text-align: center;
    font-family: monospace;
    font-weight: bold;
    margin-top: 8px;
    display: none;
    letter-spacing: 0.1em;
  `;
  container.appendChild(cannotLabel);

  const uiRoot = document.getElementById('ui-root') || document.body;
  uiRoot.appendChild(container);

  // ── Context Menu ──────────────────────────────────────────────────────
  // pointer-events: none so the virtual cursor hit-tests handle all interaction
  const contextMenu = document.createElement('div');
  contextMenu.id = 'inventory-context-menu';
  contextMenu.style.cssText = `
    position: fixed;
    display: none;
    background: rgba(30, 30, 40, 0.97);
    border: 1px solid #666;
    padding: 4px 0;
    z-index: 1100;
    min-width: 140px;
    font-family: monospace;
    font-size: 13px;
    pointer-events: none;
    user-select: none;
    -webkit-user-select: none;
  `;
  document.body.appendChild(contextMenu);

  document.addEventListener('selectstart', e => {
    if (!isOpen) return;
    e.preventDefault();
  });

  document.addEventListener('dragstart', e => {
    if (!isOpen) return;
    e.preventDefault();
  });

  function addMenuOption(label, action) {
    const opt = document.createElement('div');
    opt.textContent = label;
    opt.style.cssText = `
      padding: 6px 16px;
      color: #ccc;
    `;
    menuOptionElements.push({ element: opt, action });
    contextMenu.appendChild(opt);
  }

  function showContextMenu(slotIndex, x, y, isEquippedSlot) {
    contextMenu.innerHTML = '';
    menuOptionElements = [];

    const slot = isEquippedSlot ? inventory.getEquipped() : inventory.getSlot(slotIndex);
    if (!slot || !slot.itemType) return;
    const def = getItemDef(slot.itemType);
    if (!def) return;

    if (def.usable && !isEquippedSlot) {
      addMenuOption('Use', () => {
        const used = inventory.useItem(slotIndex, playerHealth);
        if (!used) showCannotFeedback('ALREADY AT FULL HP');
        hideContextMenu();
      });
    }
    if (def.equippable && !isEquippedSlot) {
      addMenuOption('Equip', () => {
        inventory.equipItem(slotIndex);
        hideContextMenu();
      });
    }
    if (def.droppable) {
      addMenuOption('Drop', () => {
        let dropped;
        if (isEquippedSlot) {
          dropped = inventory.dropEquipped();
        } else {
          dropped = inventory.dropItem(slotIndex);
        }
        if (dropped && callbacks && callbacks.onDrop) {
          callbacks.onDrop(dropped.itemType, dropped.quantity);
        }
        hideContextMenu();
      });
    }

    if (menuOptionElements.length === 0) return;

    const menuX = Math.min(x, window.innerWidth - 160);
    const menuY = Math.min(y, window.innerHeight - 160);
    contextMenu.style.left = menuX + 'px';
    contextMenu.style.top = menuY + 'px';
    contextMenu.style.display = 'block';
  }

  function hideContextMenu() {
    contextMenu.style.display = 'none';
    menuOptionElements = [];
  }

  // ── Cannot-drop / action feedback ─────────────────────────────────────
  function showCannotFeedback(message) {
    cannotLabel.textContent = message;
    cannotLabel.style.display = 'block';
    cannotTimer = 1.4;
  }

  // ── Drag ghost ────────────────────────────────────────────────────────
  function createDragGhost(itemType) {
    const def = getItemDef(itemType);
    if (!def) return null;
    const ghost = document.createElement('div');
    ghost.style.cssText = `
      position: fixed;
      width: 60px;
      height: 60px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: monospace;
      font-size: 20px;
      font-weight: bold;
      color: #fff;
      border-radius: 4px;
      pointer-events: none;
      z-index: 1300;
      opacity: 0.85;
      transform: translate(-50%, -50%);
      background-color: ${colorToHex(def.modelConfig.color)};
      text-shadow: 0 0 4px rgba(0,0,0,0.8);
      border: 2px solid rgba(255,255,255,0.35);
      box-shadow: 0 4px 12px rgba(0,0,0,0.6);
    `;
    ghost.textContent = def.initials;
    document.body.appendChild(ghost);
    ghost.style.left = cursorX + 'px';
    ghost.style.top = cursorY + 'px';
    return ghost;
  }

  // ── Drop target validation ─────────────────────────────────────────────
  // Returns true if dropping the currently-dragged item onto targetSlot is valid.
  function isValidGridDropTarget(targetSlot) {
    const sourceData = dragSourceIsEquipped
      ? inventory.getEquipped()
      : inventory.getSlot(dragSourceSlot);
    const targetData = inventory.getSlot(targetSlot);

    // Empty slot: always valid
    if (!targetData.itemType) return true;

    if (dragSourceIsEquipped) {
      // Equipped weapon → occupied grid slot: only if target is also equippable (weapon swap)
      const targetDef = getItemDef(targetData.itemType);
      return !!(targetDef && targetDef.equippable);
    }

    // Same source and target: no-op, count as valid
    if (targetSlot === dragSourceSlot) return true;

    // Same item type: valid if stackable AND target isn't already full
    if (targetData.itemType === sourceData.itemType) {
      if (!canStack(sourceData.itemType)) return false;
      return targetData.quantity < getMaxStack(targetData.itemType);
    }

    // Different types: valid only if a combine recipe exists
    return getRecipe(sourceData.itemType, targetData.itemType) !== null;
  }

  // Returns true if dropping the currently-dragged grid item onto the equipped slot is valid.
  function isValidEquippedDropTarget() {
    if (dragSourceIsEquipped) return false;
    const sourceData = inventory.getSlot(dragSourceSlot);
    if (!sourceData.itemType) return false;
    const def = getItemDef(sourceData.itemType);
    return !!(def && def.equippable);
  }

  // ── Drag start / end ──────────────────────────────────────────────────
  function startDrag(slotIndex, isEquipped) {
    const slot = isEquipped ? inventory.getEquipped() : inventory.getSlot(slotIndex);
    if (!slot || !slot.itemType) return;
    isDragging = true;
    dragSourceSlot = slotIndex;
    dragSourceIsEquipped = isEquipped;
    dragGhost = createDragGhost(slot.itemType);
  }

  function stopDrag() {
    if (dragGhost) { dragGhost.remove(); dragGhost = null; }
    isDragging = false;
    dragSourceSlot = -1;
    dragSourceIsEquipped = false;
  }

  function endDrag() {
    if (!isDragging) return;

    const targetSlot = getSlotUnderCursor(cursorX, cursorY);
    const targetIsEquipped = isEquippedUnderCursor(cursorX, cursorY);
    const insidePanel = isOverInventory(cursorX, cursorY);

    if (dragSourceIsEquipped) {
      // ── Dragging from equipped slot ──────────────────────────────────
      if (targetIsEquipped) {
        // Back on itself – no-op
      } else if (targetSlot !== -1) {
        const targetData = inventory.getSlot(targetSlot);
        if (!targetData.itemType) {
          inventory.unequipToSlot(targetSlot);
        } else {
          const targetDef = getItemDef(targetData.itemType);
          if (targetDef && targetDef.equippable) {
            inventory.swapEquippedWithSlot(targetSlot);
          } else {
            showCannotFeedback('CANNOT PLACE HERE');
          }
        }
      } else if (!insidePanel) {
        // Dropped outside inventory → drop on ground
        const eq = inventory.getEquipped();
        if (eq.itemType) {
          const def = getItemDef(eq.itemType);
          if (def && def.droppable) {
            const dropped = inventory.dropEquipped();
            if (dropped && callbacks && callbacks.onDrop) {
              callbacks.onDrop(dropped.itemType, dropped.quantity);
            }
          } else {
            showCannotFeedback('CANNOT DROP');
          }
        }
      }
      // else: hovering inside panel but not on a slot → cancel (no-op)

    } else {
      // ── Dragging from grid slot ───────────────────────────────────────
      if (targetSlot === dragSourceSlot) {
        // Dropped on same slot – no-op
      } else if (targetSlot !== -1) {
        if (!isValidGridDropTarget(targetSlot)) {
          showCannotFeedback('CANNOT COMBINE');
        } else {
          const targetData = inventory.getSlot(targetSlot);
          const sourceData = inventory.getSlot(dragSourceSlot);
          if (!targetData.itemType) {
            // Move to empty slot
            inventory.moveItem(dragSourceSlot, targetSlot);
          } else if (targetData.itemType === sourceData.itemType && canStack(sourceData.itemType)) {
            // Stack same type — moveItem transfers as much as fits, remainder stays in source
            const space = getMaxStack(targetData.itemType) - targetData.quantity;
            if (space === 0) {
              showCannotFeedback('STACK FULL');
            } else {
              inventory.moveItem(dragSourceSlot, targetSlot);
            }
          } else {
            // Combine via recipe
            const combined = inventory.combineItems(dragSourceSlot, targetSlot);
            if (!combined) showCannotFeedback('CANNOT COMBINE');
          }
        }
      } else if (targetIsEquipped) {
        if (!isValidEquippedDropTarget()) {
          showCannotFeedback('CANNOT EQUIP');
        } else {
          inventory.equipItem(dragSourceSlot);
        }
      } else if (!insidePanel) {
        // Dropped outside inventory → drop on ground
        const slot = inventory.getSlot(dragSourceSlot);
        if (slot.itemType) {
          const def = getItemDef(slot.itemType);
          if (def && def.droppable) {
            const dropped = inventory.dropItem(dragSourceSlot);
            if (dropped && callbacks && callbacks.onDrop) {
              callbacks.onDrop(dropped.itemType, dropped.quantity);
            }
          } else {
            showCannotFeedback('CANNOT DROP');
          }
        }
      }
      // else: hovering inside panel but not on a slot → cancel (no-op)
    }

    stopDrag();
  }

  // ── Hit testing ───────────────────────────────────────────────────────
  function getSlotUnderCursor(cx, cy) {
    for (let i = 0; i < 9; i++) {
      const rect = uiSlots[i].element.getBoundingClientRect();
      if (cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom) {
        return i;
      }
    }
    return -1;
  }

  function isEquippedUnderCursor(cx, cy) {
    const rect = equippedSlotDiv.getBoundingClientRect();
    return cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom;
  }

  function isOverInventory(cx, cy) {
    const rect = container.getBoundingClientRect();
    return cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom;
  }

  // ── Suppress native context menu ──────────────────────────────────────
  document.addEventListener('contextmenu', e => e.preventDefault());

  // ── Mouse handlers ────────────────────────────────────────────────────
  document.addEventListener('mousedown', e => {
    if (!isOpen) return;

    if (e.button === 0 || e.button === 2) {
      e.preventDefault();
    }

    const pointerLocked = !!document.pointerLockElement;
    if (cursorNeedsAbsoluteSync || !pointerLocked) {
      setCursorAbsolute(e.clientX, e.clientY);
      cursorNeedsAbsoluteSync = false;
    }

    if (e.button === 2) {
      // Right-click: open context menu (not while dragging)
      if (isDragging) return;
      const slotIdx = getSlotUnderCursor(cursorX, cursorY);
      const eqHover = isEquippedUnderCursor(cursorX, cursorY);
      if (slotIdx !== -1) {
        const slot = inventory.getSlot(slotIdx);
        if (slot.itemType) {
          showContextMenu(slotIdx, cursorX, cursorY, false);
        } else {
          hideContextMenu();
        }
      } else if (eqHover) {
        const eq = inventory.getEquipped();
        if (eq.itemType) {
          showContextMenu(-1, cursorX, cursorY, true);
        } else {
          hideContextMenu();
        }
      } else {
        hideContextMenu();
      }
      return;
    }

    if (e.button !== 0) return;

    // Left-click: if context menu open, check for virtual-cursor option selection
    if (contextMenu.style.display !== 'none') {
      for (const { element, action } of menuOptionElements) {
        const rect = element.getBoundingClientRect();
        if (cursorX >= rect.left && cursorX <= rect.right &&
            cursorY >= rect.top && cursorY <= rect.bottom) {
          action();
          return;
        }
      }
      hideContextMenu();
      return;
    }

    // Left-click: start drag if on occupied slot
    const slotIdx = getSlotUnderCursor(cursorX, cursorY);
    const eqHover = isEquippedUnderCursor(cursorX, cursorY);
    if (slotIdx !== -1) {
      const slot = inventory.getSlot(slotIdx);
      if (slot.itemType) startDrag(slotIdx, false);
    } else if (eqHover) {
      const eq = inventory.getEquipped();
      if (eq.itemType) startDrag(-1, true);
    }
  });

  document.addEventListener('mouseup', e => {
    if (e.button !== 0 || !isOpen) return;
    if (isDragging) endDrag();
  });

  // ── Escape: cancel drag / close context menu ──────────────────────────
  window.addEventListener('keydown', e => {
    if (e.code === 'Escape') {
      if (contextMenu.style.display !== 'none') hideContextMenu();
      if (isDragging) stopDrag();
    }
  });

  // ── Public API ────────────────────────────────────────────────────────
  return {
    toggle() {
      isOpen = !isOpen;
      container.style.display = isOpen ? 'block' : 'none';
      cursor.style.display = isOpen ? 'block' : 'none';

      if (isOpen) {
        cursorX = window.innerWidth / 2;
        cursorY = window.innerHeight / 2;
        cursorNeedsAbsoluteSync = !document.pointerLockElement;
        applyCursorPosition();
        this.update(0);
      } else {
        hideContextMenu();
        if (isDragging) stopDrag();
      }

      if (onToggle) onToggle(isOpen);
    },

    isOpen() {
      return isOpen;
    },

    setToggleCallback(callback) {
      onToggle = callback;
    },

    update(dt) {
      if (!isOpen) return;

      // ── Decrement cannot-drop timer ──────────────────────────────────
      if (cannotTimer > 0) {
        cannotTimer -= dt;
        if (cannotTimer <= 0) {
          cannotTimer = 0;
          cannotLabel.style.display = 'none';
        }
      }

      const slotUnderCursor = getSlotUnderCursor(cursorX, cursorY);
      const equippedUnderCursor = isEquippedUnderCursor(cursorX, cursorY);

      // ── Update grid slots ────────────────────────────────────────────
      for (let i = 0; i < 9; i++) {
        const slot = inventory.getSlot(i);
        const ui = uiSlots[i];
        const isDragSource = isDragging && !dragSourceIsEquipped && i === dragSourceSlot;

        if (slot.itemType) {
          const def = getItemDef(slot.itemType);
          if (def) {
            ui.iconDiv.style.backgroundColor = colorToHex(def.modelConfig.color);
            ui.iconDiv.textContent = def.initials;
            ui.iconDiv.style.opacity = isDragSource ? '0.25' : '1';
            ui.nameLabel.textContent = def.name;
            ui.nameLabel.style.display = 'block';

            if (slot.quantity > 1) {
              const maxStack = getMaxStack(slot.itemType);
              const isFull = slot.quantity >= maxStack;
              ui.countText.textContent = slot.quantity;
              ui.countText.style.color = isFull ? '#00ff00' : '#fff';
              ui.countText.style.display = 'block';
            } else {
              ui.countText.style.display = 'none';
            }
          }
        } else {
          ui.iconDiv.style.opacity = '0';
          ui.iconDiv.textContent = '';
          ui.nameLabel.style.display = 'none';
          ui.countText.style.display = 'none';
        }

        // ── Slot border: drag hover highlights ──────────────────────
        if (isDragging) {
          if (isDragSource) {
            ui.element.style.border = '1px dashed #666';
          } else if (slotUnderCursor === i) {
            const valid = isValidGridDropTarget(i);
            ui.element.style.border = `2px solid ${valid ? '#00ff00' : '#ff4444'}`;
          } else {
            ui.element.style.border = '1px solid #333';
          }
        } else {
          ui.element.style.border = '1px solid #444';
        }
      }

      // ── Update equipped slot ─────────────────────────────────────────
      const eq = inventory.getEquipped();
      const isDragSourceEquipped = isDragging && dragSourceIsEquipped;
      if (eq.itemType) {
        const def = getItemDef(eq.itemType);
        if (def) {
          equippedIcon.style.backgroundColor = colorToHex(def.modelConfig.color);
          equippedIcon.textContent = def.initials;
          equippedIcon.style.opacity = isDragSourceEquipped ? '0.25' : '1';
          equippedName.textContent = def.name;
          equippedName.style.display = 'block';
        }
      } else {
        equippedIcon.style.opacity = '0';
        equippedIcon.textContent = '';
        equippedName.style.display = 'none';
      }

      // Equipped slot border during drag
      if (isDragging && equippedUnderCursor && !dragSourceIsEquipped) {
        const valid = isValidEquippedDropTarget();
        equippedSlotDiv.style.border = `2px solid ${valid ? '#00ff00' : '#ff4444'}`;
      } else {
        equippedSlotDiv.style.border = '2px solid #aa8833';
      }

      // ── Context menu virtual-cursor hover highlight ──────────────────
      if (contextMenu.style.display !== 'none') {
        for (const { element } of menuOptionElements) {
          const rect = element.getBoundingClientRect();
          const hovered = cursorX >= rect.left && cursorX <= rect.right &&
                          cursorY >= rect.top && cursorY <= rect.bottom;
          element.style.background = hovered ? 'rgba(100,100,120,0.5)' : 'none';
        }
      }
    },

    destroy() {
      container.remove();
      cursor.remove();
      contextMenu.remove();
      if (dragGhost) dragGhost.remove();
    },
  };
}
