// ─── Item Registry ──────────────────────────────────────────────────────────
// Pure data module. Defines all item types, their properties, and combination recipes.
// No state — just definitions and lookup functions.

const ITEMS = {
  ammo: {
    id: 'ammo',
    name: 'Handgun Ammo',
    description: 'Standard 9mm rounds.',
    stackable: true,
    maxStack: 999,
    usable: false,
    equippable: false,
    droppable: true,
    combinable: true,
    initials: 'AM',
    modelConfig: { color: 0xccaa33, size: [0.2, 0.15, 0.3], shape: 'box' },
    useEffect: null,
  },
  healingA: {
    id: 'healingA',
    name: 'Healing Herb',
    description: 'A common herb. Restores 5 HP.',
    stackable: true,
    maxStack: 99,
    usable: true,
    equippable: false,
    droppable: true,
    combinable: true,
    initials: 'HA',
    modelConfig: { color: 0x44cc44, size: [0.25, 0.25, 0.25], shape: 'box' },
    useEffect: { type: 'heal', amount: 5 },
  },
  healingB: {
    id: 'healingB',
    name: 'First Aid Spray',
    description: 'A medical spray. Restores 3 HP.',
    stackable: true,
    maxStack: 99,
    usable: true,
    equippable: false,
    droppable: true,
    combinable: true,
    initials: 'FB',
    modelConfig: { color: 0x4488ff, size: [0.15, 0.3, 0.15], shape: 'cylinder' },
    useEffect: { type: 'heal', amount: 3 },
  },
  healingC: {
    id: 'healingC',
    name: 'Mixed Medicine',
    description: 'A potent mixture. Restores 8 HP.',
    stackable: true,
    maxStack: 99,
    usable: true,
    equippable: false,
    droppable: true,
    combinable: true,
    initials: 'MM',
    modelConfig: { color: 0xff44ff, size: [0.2, 0.25, 0.2], shape: 'cylinder' },
    useEffect: { type: 'heal', amount: 8 },
  },
  handgun: {
    id: 'handgun',
    name: 'Handgun',
    description: 'A reliable semi-automatic pistol.',
    stackable: false,
    maxStack: 1,
    usable: false,
    equippable: true,
    droppable: true,
    combinable: false,
    initials: 'HG',
    modelConfig: { color: 0x222222, size: [0.2, 0.15, 0.35], shape: 'box' },
    useEffect: null,
  },
};

// Combination recipes — bidirectional (A+B and B+A both work)
const RECIPES = [
  { ingredientA: 'healingA', ingredientB: 'healingB', result: 'healingC', resultQty: 1 },
];

// ─── Lookup Functions ───────────────────────────────────────────────────────

export function getItemDef(itemId) {
  return ITEMS[itemId] || null;
}

export function getRecipe(idA, idB) {
  for (const r of RECIPES) {
    if ((r.ingredientA === idA && r.ingredientB === idB) ||
        (r.ingredientA === idB && r.ingredientB === idA)) {
      return r;
    }
  }
  return null;
}

export function canStack(itemId) {
  const def = ITEMS[itemId];
  return def ? def.stackable : false;
}

export function getMaxStack(itemId) {
  const def = ITEMS[itemId];
  return def ? def.maxStack : 1;
}
