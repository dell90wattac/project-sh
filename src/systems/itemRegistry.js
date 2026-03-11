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
  ammoHeavy: {
    id: 'ammoHeavy',
    name: 'Heavy Handgun Ammo',
    description: 'Heavy handgun rounds.',
    stackable: true,
    maxStack: 27,
    usable: false,
    equippable: false,
    droppable: true,
    combinable: true,
    initials: 'HA',
    modelConfig: { color: 0xb86a2d, size: [0.2, 0.15, 0.3], shape: 'box' },
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

const KEY_ITEM_PREFIX = 'key:';
const KEY_MODEL_CONFIG = { color: 0xd4b24f, size: [0.28, 0.08, 0.1], shape: 'box' };

export const HANDGUN_ITEM_ID = 'handgun';
export const STANDARD_AMMO_ITEM_ID = 'ammo';
export const HEAVY_HANDGUN_AMMO_ITEM_ID = 'ammoHeavy';
export const HANDGUN_AMMO_ITEM_IDS = Object.freeze([
  STANDARD_AMMO_ITEM_ID,
  HEAVY_HANDGUN_AMMO_ITEM_ID,
]);

function normalizeKeyId(keyId) {
  return String(keyId ?? '').trim();
}

export function makeKeyItemId(keyId) {
  const normalized = normalizeKeyId(keyId);
  if (!normalized) return null;
  return `${KEY_ITEM_PREFIX}${normalized}`;
}

export function isKeyItem(itemId) {
  return typeof itemId === 'string' && itemId.startsWith(KEY_ITEM_PREFIX);
}

export function getKeyIdFromItemType(itemType) {
  if (!isKeyItem(itemType)) return null;
  return itemType.slice(KEY_ITEM_PREFIX.length);
}

function buildKeyItemDef(itemType) {
  const keyId = getKeyIdFromItemType(itemType);
  if (!keyId) return null;

  return {
    id: itemType,
    name: `Key (${keyId})`,
    description: `A tagged key for lock ${keyId}.`,
    stackable: false,
    maxStack: 1,
    usable: false,
    equippable: true,
    droppable: true,
    combinable: false,
    initials: 'KY',
    modelConfig: KEY_MODEL_CONFIG,
    useEffect: null,
  };
}

// Combination recipes — bidirectional (A+B and B+A both work)
const RECIPES = [
  { ingredientA: 'healingA', ingredientB: 'healingB', result: 'healingC', resultQty: 1 },
];

// ─── Lookup Functions ───────────────────────────────────────────────────────

export function getItemDef(itemId) {
  if (ITEMS[itemId]) return ITEMS[itemId];
  if (isKeyItem(itemId)) return buildKeyItemDef(itemId);
  return null;
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
  const def = getItemDef(itemId);
  return def ? def.stackable : false;
}

export function getMaxStack(itemId) {
  const def = getItemDef(itemId);
  return def ? def.maxStack : 1;
}

export function isHandgunAmmoItem(itemType) {
  return HANDGUN_AMMO_ITEM_IDS.includes(itemType);
}
