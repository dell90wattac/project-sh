// ─── Inventory UI ──────────────────────────────────────────────────────────
// 3x3 grid + equipped weapon slot. Left-click context menu (Use, Combine, Drop, Equip).
// Combine mode: click Combine → cursor turns yellow → click target slot.

import { getItemDef, getMaxStack } from '../systems/itemRegistry.js';

export function createInventoryUI(inventory, playerHealth, callbacks) {
  let isOpen = false;
  let onToggle = null;

  // ── Combine mode state ────────────────────────────────────────────────
  let combineMode = false;
  let combineSourceSlot = -1;

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

  document.addEventListener('mousemove', e => {
    if (isOpen) {
      cursorX += e.movementX || 0;
      cursorY += e.movementY || 0;
      cursorX = Math.max(0, Math.min(window.innerWidth, cursorX));
      cursorY = Math.max(0, Math.min(window.innerHeight, cursorY));
      cursor.style.left = (cursorX - 10) + 'px';
      cursor.style.top = (cursorY - 10) + 'px';
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
  infoText.textContent = 'Press E to close  •  Left-click for options';
  infoText.style.cssText = `
    color: #666;
    font-size: 11px;
    text-align: center;
    font-family: monospace;
  `;
  container.appendChild(infoText);

  // ── Combine mode label ────────────────────────────────────────────────
  const combineLabel = document.createElement('div');
  combineLabel.textContent = 'SELECT TARGET ITEM TO COMBINE';
  combineLabel.style.cssText = `
    color: #ffff00;
    font-size: 12px;
    text-align: center;
    font-family: monospace;
    font-weight: bold;
    margin-top: 8px;
    display: none;
  `;
  container.appendChild(combineLabel);

  const uiRoot = document.getElementById('ui-root') || document.body;
  uiRoot.appendChild(container);

  // ── Context Menu ──────────────────────────────────────────────────────
  const contextMenu = document.createElement('div');
  contextMenu.id = 'inventory-context-menu';
  contextMenu.style.cssText = `
    position: fixed;
    display: none;
    background: rgba(30, 30, 40, 0.95);
    border: 1px solid #666;
    padding: 4px 0;
    z-index: 1100;
    min-width: 130px;
    font-family: monospace;
    font-size: 13px;
    pointer-events: auto;
  `;
  document.body.appendChild(contextMenu);

  function addMenuOption(label, onClick) {
    const opt = document.createElement('div');
    opt.textContent = label;
    opt.style.cssText = `
      padding: 6px 16px;
      color: #ccc;
      cursor: pointer;
    `;
    opt.addEventListener('mouseenter', () => { opt.style.background = 'rgba(100,100,120,0.5)'; });
    opt.addEventListener('mouseleave', () => { opt.style.background = 'none'; });
    opt.addEventListener('click', e => {
      e.stopPropagation();
      onClick();
    });
    contextMenu.appendChild(opt);
  }

  function showContextMenu(slotIndex, x, y, isEquippedSlot) {
    contextMenu.innerHTML = '';
    const slot = isEquippedSlot ? inventory.getEquipped() : inventory.getSlot(slotIndex);
    if (!slot || !slot.itemType) return;
    const def = getItemDef(slot.itemType);
    if (!def) return;

    if (def.usable && !isEquippedSlot) {
      addMenuOption('Use', () => {
        inventory.useItem(slotIndex, playerHealth);
        hideContextMenu();
      });
    }
    if (def.combinable && !isEquippedSlot) {
      addMenuOption('Combine', () => {
        enterCombineMode(slotIndex);
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

    // Position menu at cursor, clamp to screen
    const menuX = Math.min(x, window.innerWidth - 150);
    const menuY = Math.min(y, window.innerHeight - 200);
    contextMenu.style.left = menuX + 'px';
    contextMenu.style.top = menuY + 'px';
    contextMenu.style.display = 'block';
  }

  function hideContextMenu() {
    contextMenu.style.display = 'none';
  }

  // ── Combine mode ──────────────────────────────────────────────────────
  function enterCombineMode(slotIndex) {
    combineMode = true;
    combineSourceSlot = slotIndex;
    combineLabel.style.display = 'block';
    // Yellow cursor
    cursorInner.style.borderColor = '#ffff00';
    cursorInner.style.boxShadow = '0 0 10px rgba(255, 255, 0, 0.6)';
    cursorCross.style.background = '#ffff00';
    cursorCross.style.boxShadow = '0 0 5px rgba(255, 255, 0, 0.8)';
  }

  function exitCombineMode() {
    combineMode = false;
    combineSourceSlot = -1;
    combineLabel.style.display = 'none';
    // Green cursor
    cursorInner.style.borderColor = '#00ff00';
    cursorInner.style.boxShadow = '0 0 10px rgba(0, 255, 0, 0.6)';
    cursorCross.style.background = '#00ff00';
    cursorCross.style.boxShadow = '0 0 5px rgba(0, 255, 0, 0.8)';
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

  // ── Suppress native context menu ──────────────────────────────────────
  document.addEventListener('contextmenu', e => e.preventDefault());

  // ── Left-click handler: context menu + combine mode ───────────────────
  document.addEventListener('mousedown', e => {
    if (e.button !== 0 || !isOpen) return;

    // If context menu is open, close it (unless clicking inside menu)
    if (contextMenu.style.display !== 'none') {
      const menuRect = contextMenu.getBoundingClientRect();
      if (cursorX >= menuRect.left && cursorX <= menuRect.right &&
          cursorY >= menuRect.top && cursorY <= menuRect.bottom) {
        return; // Let the menu option handle it
      }
      hideContextMenu();
      return;
    }

    // Combine mode: attempt combination on target slot
    if (combineMode) {
      const targetSlot = getSlotUnderCursor(cursorX, cursorY);
      if (targetSlot !== -1 && targetSlot !== combineSourceSlot) {
        inventory.combineItems(combineSourceSlot, targetSlot);
      }
      exitCombineMode();
      return;
    }

    // Show context menu on left-click on an occupied slot
    const slotIdx = getSlotUnderCursor(cursorX, cursorY);
    const eqHover = isEquippedUnderCursor(cursorX, cursorY);

    if (slotIdx !== -1) {
      const slot = inventory.getSlot(slotIdx);
      if (slot.itemType) {
        showContextMenu(slotIdx, cursorX, cursorY, false);
      }
    } else if (eqHover) {
      const eq = inventory.getEquipped();
      if (eq.itemType) {
        showContextMenu(-1, cursorX, cursorY, true);
      }
    }
  });

  // ── Escape handler ────────────────────────────────────────────────────
  window.addEventListener('keydown', e => {
    if (e.code === 'Escape') {
      if (contextMenu.style.display !== 'none') {
        hideContextMenu();
      }
      if (combineMode) {
        exitCombineMode();
      }
    }
  });

  // ── Helper: convert color number to CSS hex ───────────────────────────
  function colorToHex(color) {
    return '#' + color.toString(16).padStart(6, '0');
  }

  // ── Public API ────────────────────────────────────────────────────────
  return {
    toggle() {
      isOpen = !isOpen;
      container.style.display = isOpen ? 'block' : 'none';
      cursor.style.display = isOpen ? 'block' : 'none';

      if (isOpen) {
        cursorX = window.innerWidth / 2;
        cursorY = window.innerHeight / 2;
        cursor.style.left = (cursorX - 10) + 'px';
        cursor.style.top = (cursorY - 10) + 'px';
        this.update(0);
      } else {
        hideContextMenu();
        if (combineMode) exitCombineMode();
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

      // ── Update grid slots ─────────────────────────────────────────────
      for (let i = 0; i < 9; i++) {
        const slot = inventory.getSlot(i);
        const ui = uiSlots[i];

        if (slot.itemType) {
          const def = getItemDef(slot.itemType);
          if (def) {
            ui.iconDiv.style.backgroundColor = colorToHex(def.modelConfig.color);
            ui.iconDiv.textContent = def.initials;
            ui.iconDiv.style.opacity = '1';
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

        // Highlight combine source slot
        if (combineMode && i === combineSourceSlot) {
          ui.element.style.border = '2px solid #ffff00';
        } else {
          ui.element.style.border = '1px solid #444';
        }
      }

      // ── Update equipped slot ──────────────────────────────────────────
      const eq = inventory.getEquipped();
      if (eq.itemType) {
        const def = getItemDef(eq.itemType);
        if (def) {
          equippedIcon.style.backgroundColor = colorToHex(def.modelConfig.color);
          equippedIcon.textContent = def.initials;
          equippedIcon.style.opacity = '1';
          equippedName.textContent = def.name;
          equippedName.style.display = 'block';
        }
      } else {
        equippedIcon.style.opacity = '0';
        equippedIcon.textContent = '';
        equippedName.style.display = 'none';
      }
    },

    destroy() {
      container.remove();
      cursor.remove();
      contextMenu.remove();
    },
  };
}
