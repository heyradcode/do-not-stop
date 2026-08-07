/**
 * The item catalog's shape and its validation (roadmap §4).
 *
 * Content lives in `catalog.data.ts` as a typed literal rather than a JSON file.
 * The backend has no `resolveJsonModule` and imports no JSON anywhere in `src`, so a
 * `.json` would need a compiler flag plus a build-copy step to reach `dist`; a data
 * module is the same flat list with type errors caught at compile time instead.
 *
 * Validation is here, separate from the data and from the database, because these rules
 * are the ones a content edit gets wrong: an equipment item with no slot, a consumable
 * with no effect, two items sharing a token id. All of them are cheap to check and
 * expensive to discover in production, and none of them need a connection to check.
 */

/** Equip slots, mirroring ItemCore.SLOT_*. The contract is authoritative. */
export const SLOT = { weapon: 0, armor: 1, trinket: 2 } as const;
export type SlotName = keyof typeof SLOT;

export const ITEM_CATEGORIES = ['consumable', 'equipment', 'collectible', 'material'] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

/**
 * Flat, non-negative additions to a pet's extracted attributes.
 *
 * Non-negative and additive only in v1, which §4 recommends and which also removes a
 * real hazard: the engine truncates to 16 bits with wraparound rather than clamping, so
 * a negative modifier is one underflow away from a pet with 65,000 HP. A multiplicative
 * or conditional effect system is a v2 of the equipment model, not a field added here.
 */
export interface StatBonus {
    kind: 'stat_bonus';
    hp: number;
    atk: number;
    def: number;
    int: number;
    mdef: number;
}

export type ItemEffect =
    | StatBonus
    | { kind: 'grant_xp'; amount: number }
    | { kind: 'clear_battle_cooldown' }
    | { kind: 'clear_breed_cooldown' };

/** One catalog entry, as authored. */
export interface ItemDefinitionSeed {
    /** ERC-1155 token id as a decimal string, matching item_roster.item_type. */
    itemType: string;
    /** Stable content key. Survives a redeploy that renumbers token ids. */
    key: string;
    category: ItemCategory;
    /** Required for equipment, absent otherwise. */
    slot?: SlotName;
    /** 1-5, the same scale as pet rarity. */
    rarity: number;
    effect?: ItemEffect;
    name: string;
    description: string;
}

/**
 * Sanity bounds, not game-design opinions.
 *
 * A pet's extracted attributes land in the low hundreds, so a bonus in the thousands is
 * a typo rather than a tuning choice. Anything inside these is the designer's call.
 */
const MAX_STAT_BONUS = 500;
const MAX_XP_GRANT = 100_000;

const SAFE_KEY_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;

/**
 * Validates the whole catalog, returning it unchanged.
 *
 * Whole-catalog rather than per-item, because the two failures that matter most are
 * collisions: a duplicate token id would give two definitions to one on-chain item, and
 * a duplicate key would make seed data ambiguous about which row it meant.
 */
export function assertCatalog(items: readonly ItemDefinitionSeed[]): readonly ItemDefinitionSeed[] {
    const seenTypes = new Set<string>();
    const seenKeys = new Set<string>();

    for (const item of items) {
        assertItem(item);
        if (seenTypes.has(item.itemType)) {
            throw new Error(`duplicate item type ${item.itemType} (${item.key})`);
        }
        if (seenKeys.has(item.key)) {
            throw new Error(`duplicate item key ${item.key}`);
        }
        seenTypes.add(item.itemType);
        seenKeys.add(item.key);
    }

    return items;
}

function assertItem(item: ItemDefinitionSeed): void {
    const label = item.key || item.itemType;

    if (!/^[1-9][0-9]*$/.test(item.itemType)) {
        // Type 0 is ItemCore's empty-slot sentinel, and registerItemSlot refuses it.
        throw new Error(`${label}: itemType must be a positive decimal string, got ${JSON.stringify(item.itemType)}`);
    }
    if (!SAFE_KEY_PATTERN.test(item.key)) {
        throw new Error(`${label}: key must be lower_snake_case, got ${JSON.stringify(item.key)}`);
    }
    if (!ITEM_CATEGORIES.includes(item.category)) {
        throw new Error(`${label}: unknown category ${JSON.stringify(item.category)}`);
    }
    if (!Number.isInteger(item.rarity) || item.rarity < 1 || item.rarity > 5) {
        throw new Error(`${label}: rarity must be 1-5, got ${item.rarity}`);
    }
    if (!item.name.trim() || !item.description.trim()) {
        throw new Error(`${label}: name and description are required`);
    }

    if (item.category === 'equipment') {
        if (item.slot === undefined) {
            throw new Error(`${label}: equipment needs a slot`);
        }
        if (item.effect?.kind !== 'stat_bonus') {
            // Equipment with no modifier would be a cosmetic, and cosmetics are out of
            // the v1 catalog. Letting one in would mean a geared snapshot whose entry
            // resolves to nothing, which reads as a bug rather than as a choice.
            throw new Error(`${label}: equipment needs a stat_bonus effect`);
        }
        assertStatBonus(item.effect, label);
        return;
    }

    if (item.slot !== undefined) {
        throw new Error(`${label}: only equipment may declare a slot`);
    }

    if (item.category === 'consumable') {
        if (!item.effect) {
            throw new Error(`${label}: a consumable needs an effect`);
        }
        if (item.effect.kind === 'stat_bonus') {
            throw new Error(`${label}: stat_bonus is an equipment effect, not a consumable one`);
        }
        if (item.effect.kind === 'grant_xp') {
            if (!Number.isInteger(item.effect.amount) || item.effect.amount < 1 || item.effect.amount > MAX_XP_GRANT) {
                throw new Error(`${label}: grant_xp amount must be 1-${MAX_XP_GRANT}, got ${item.effect.amount}`);
            }
        }
        return;
    }

    // Collectibles and materials are inert by definition: they are gacha inputs and
    // crafting inputs, and an effect on one would be a consumable wearing the wrong
    // category.
    if (item.effect) {
        throw new Error(`${label}: a ${item.category} must not carry an effect`);
    }
}

function assertStatBonus(effect: StatBonus, label: string): void {
    for (const field of ['hp', 'atk', 'def', 'int', 'mdef'] as const) {
        const value = effect[field];
        if (!Number.isInteger(value) || value < 0 || value > MAX_STAT_BONUS) {
            throw new Error(`${label}: ${field} bonus must be an integer 0-${MAX_STAT_BONUS}, got ${value}`);
        }
    }
    if (effect.hp + effect.atk + effect.def + effect.int + effect.mdef === 0) {
        throw new Error(`${label}: a stat_bonus that grants nothing is a cosmetic, which v1 does not carry`);
    }
}
