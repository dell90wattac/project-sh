// ─── Item Registry ──────────────────────────────────────────────────────────
// Pure data module. Defines all item types, their properties, and combination recipes.
// No state — just definitions and lookup functions.

const ITEMS = {
  ammo: {
    id: 'ammo',
    name: 'Handgun Ammo',
    description: 'Standard 9mm rounds.',
    stackable: true,
    maxStack: 27,
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
    name: 'Healing Item 1',
    description: 'A small remedy. Restores 2 HP.',
    stackable: true,
    maxStack: 3,
    usable: true,
    equippable: false,
    droppable: true,
    combinable: true,
    initials: 'H1',
    modelConfig: { color: 0x44cc44, size: [0.25, 0.25, 0.25], shape: 'box' },
    useEffect: { type: 'heal', amount: 2 },
  },
  healingB: {
    id: 'healingB',
    name: 'Healing Item 2',
    description: 'A stronger remedy. Restores 5 HP.',
    stackable: true,
    maxStack: 3,
    usable: true,
    equippable: false,
    droppable: true,
    combinable: true,
    initials: 'H2',
    modelConfig: { color: 0x4488ff, size: [0.15, 0.3, 0.15], shape: 'cylinder' },
    useEffect: { type: 'heal', amount: 5 },
  },
  healingC: {
    id: 'healingC',
    name: 'Healing Item 3',
    description: 'A potent mixture. Restores 8 HP.',
    stackable: true,
    maxStack: 3,
    usable: true,
    equippable: false,
    droppable: true,
    combinable: false,
    initials: 'H3',
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
