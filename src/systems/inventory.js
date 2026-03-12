// ─── Inventory System ──────────────────────────────────────────────────────
// 9-slot grid (3x3) + 1 equipped weapon slot.
// Items linked to itemRegistry for stack limits, use effects, and recipes.

import { getItemDef, getRecipe, canStack, getMaxStack } from './itemRegistry.js';

export function createInventory() {
  const slots = Array(9).fill(null).map(() => ({
    itemType: null,
    quantity: 0,
  }));

  // Equipped weapon slot (separate from grid)
  const equipped = { itemType: null, quantity: 0 };

  const api = {
    // Add items to inventory. Respects maxStack. Returns true if all fit.
    addItem(itemType, quantity) {
      const def = getItemDef(itemType);
      let remaining = quantity;
      if (!def || remaining <= 0) return false;

      if (def.stackable) {
        // Try existing stacks first
        for (let i = 0; i < slots.length && remaining > 0; i++) {
          if (slots[i].itemType === itemType) {
            const space = def.maxStack - slots[i].quantity;
            const add = Math.min(space, remaining);
            slots[i].quantity += add;
            remaining -= add;
          }
        }
        // Then empty slots
        while (remaining > 0) {
          const emptyIdx = slots.findIndex(s => s.itemType === null);
          if (emptyIdx === -1) return false;
          const add = Math.min(def.maxStack, remaining);
          slots[emptyIdx].itemType = itemType;
          slots[emptyIdx].quantity = add;
          remaining -= add;
        }
      } else {
        // Non-stackable: one per slot
        while (remaining > 0) {
          const emptyIdx = slots.findIndex(s => s.itemType === null);
          if (emptyIdx === -1) return false;
          slots[emptyIdx].itemType = itemType;
          slots[emptyIdx].quantity = 1;
          remaining -= 1;
        }
      }
      return true;
    },

    // Query: can this quantity fit without mutating inventory?
    canFitItem(itemType, quantity) {
      const def = getItemDef(itemType);
      if (!def) return false;
      if (quantity <= 0) return true;

      if (def.stackable) {
        let remaining = quantity;
        for (let i = 0; i < slots.length && remaining > 0; i++) {
          if (slots[i].itemType === itemType) {
            const space = def.maxStack - slots[i].quantity;
            if (space > 0) {
              remaining -= space;
            }
          }
        }
        if (remaining <= 0) return true;

        let emptySlots = 0;
        for (let i = 0; i < slots.length; i++) {
          if (slots[i].itemType === null) emptySlots += 1;
        }
        return emptySlots * def.maxStack >= remaining;
      }

      let emptySlots = 0;
      for (let i = 0; i < slots.length; i++) {
        if (slots[i].itemType === null) emptySlots += 1;
      }
      return emptySlots >= quantity;
    },

    // Remove items from inventory. Returns actual amount removed.
    removeItem(itemType, quantity) {
      let remaining = quantity;
      let removed = 0;

      for (let i = 0; i < slots.length && remaining > 0; i++) {
        if (slots[i].itemType !== itemType) continue;

        const actualRemoved = Math.min(slots[i].quantity, remaining);
        slots[i].quantity -= actualRemoved;
        remaining -= actualRemoved;
        removed += actualRemoved;

        if (slots[i].quantity === 0) {
          slots[i].itemType = null;
        }
      }

      return removed;
    },

    // Query total quantity of an item type across all slots
    getItemCount(itemType) {
      let total = 0;
      for (let i = 0; i < slots.length; i++) {
        if (slots[i].itemType === itemType) {
          total += slots[i].quantity;
        }
      }
      return total;
    },

    // Get all occupied slots (for UI rendering)
    getItems() {
      return slots
        .map((slot, index) => ({
          slotIndex: index,
          itemType: slot.itemType,
          quantity: slot.quantity,
        }))
        .filter(slot => slot.itemType !== null);
    },

    // Get specific slot
    getSlot(index) {
      return slots[index];
    },

    // ─── Equipped Weapon Slot ─────────────────────────────────────────────

    equipItem(slotIndex) {
      const slot = slots[slotIndex];
      if (!slot.itemType) return false;
      const def = getItemDef(slot.itemType);
      if (!def || !def.equippable) return false;

      const prev = { itemType: equipped.itemType, quantity: equipped.quantity };
      equipped.itemType = slot.itemType;
      equipped.quantity = slot.quantity;

      if (prev.itemType) {
        slot.itemType = prev.itemType;
        slot.quantity = prev.quantity;
      } else {
        slot.itemType = null;
        slot.quantity = 0;
      }
      return true;
    },

    unequipItem() {
      if (!equipped.itemType) return false;
      const emptyIdx = slots.findIndex(s => s.itemType === null);
      if (emptyIdx === -1) return false;
      slots[emptyIdx].itemType = equipped.itemType;
      slots[emptyIdx].quantity = equipped.quantity;
      equipped.itemType = null;
      equipped.quantity = 0;
      return true;
    },

    getEquipped() {
      return { itemType: equipped.itemType, quantity: equipped.quantity };
    },

    setEquippedDirect(itemType, quantity) {
      equipped.itemType = itemType;
      equipped.quantity = quantity;
    },

    // Unequip equipped item to a specific empty slot
    unequipToSlot(slotIndex) {
      if (!equipped.itemType) return false;
      const slot = slots[slotIndex];
      if (slot.itemType !== null) return false;
      slot.itemType = equipped.itemType;
      slot.quantity = equipped.quantity;
      equipped.itemType = null;
      equipped.quantity = 0;
      return true;
    },

    // Swap equipped item with an occupied grid slot (both must be equippable)
    swapEquippedWithSlot(slotIndex) {
      const slot = slots[slotIndex];
      if (!equipped.itemType || !slot.itemType) return false;
      const tmpType = equipped.itemType;
      const tmpQty = equipped.quantity;
      equipped.itemType = slot.itemType;
      equipped.quantity = slot.quantity;
      slot.itemType = tmpType;
      slot.quantity = tmpQty;
      return true;
    },

    // ─── Move / Swap Slots ────────────────────────────────────────────────

    moveItem(fromSlot, toSlot) {
      const a = slots[fromSlot];
      const b = slots[toSlot];
      if (a.itemType === b.itemType && a.itemType !== null && canStack(a.itemType)) {
        const max = getMaxStack(a.itemType);
        const transfer = Math.min(a.quantity, max - b.quantity);
        b.quantity += transfer;
        a.quantity -= transfer;
        if (a.quantity === 0) { a.itemType = null; }
      } else {
        const tmpType = a.itemType;
        const tmpQty = a.quantity;
        a.itemType = b.itemType;
        a.quantity = b.quantity;
        b.itemType = tmpType;
        b.quantity = tmpQty;
      }
    },

    // ─── Use Item ─────────────────────────────────────────────────────────

    useItem(slotIndex, playerHealth) {
      const slot = slots[slotIndex];
      if (!slot.itemType) return false;
      const def = getItemDef(slot.itemType);
      if (!def || !def.usable || !def.useEffect) return false;

      if (def.useEffect.type === 'heal') {
        const healed = playerHealth.heal(def.useEffect.amount);
        if (healed === 0) return false;
      }

      slot.quantity -= 1;
      if (slot.quantity <= 0) {
        slot.itemType = null;
        slot.quantity = 0;
      }
      return true;
    },

    // ─── Combine Items ────────────────────────────────────────────────────

    combineItems(slotA, slotB) {
      const a = slots[slotA];
      const b = slots[slotB];
      if (!a.itemType || !b.itemType) return false;

      // Check recipes first
      const recipe = getRecipe(a.itemType, b.itemType);
      if (recipe) {
        a.quantity -= 1;
        b.quantity -= 1;
        if (a.quantity <= 0) { a.itemType = null; a.quantity = 0; }
        if (b.quantity <= 0) { b.itemType = null; b.quantity = 0; }
        api.addItem(recipe.result, recipe.resultQty);
        return true;
      }

      // Same-type merge fallback
      if (a.itemType === b.itemType && canStack(a.itemType)) {
        api.moveItem(slotA, slotB);
        return true;
      }

      return false;
    },

    // ─── Drop Items ───────────────────────────────────────────────────────

    dropItem(slotIndex) {
      const slot = slots[slotIndex];
      if (!slot.itemType) return null;
      const def = getItemDef(slot.itemType);
      if (!def || !def.droppable) return null;
      const dropped = { itemType: slot.itemType, quantity: slot.quantity };
      slot.itemType = null;
      slot.quantity = 0;
      return dropped;
    },

    dropEquipped() {
      if (!equipped.itemType) return null;
      const def = getItemDef(equipped.itemType);
      if (!def || !def.droppable) return null;
      const dropped = { itemType: equipped.itemType, quantity: equipped.quantity };
      equipped.itemType = null;
      equipped.quantity = 0;
      return dropped;
    },

    debug() {
      console.log('Inventory:', slots, 'Equipped:', equipped);
    },
  };

  return api;
}
