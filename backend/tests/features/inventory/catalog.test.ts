import { describe, expect, it } from 'vitest';

import { assertCatalog, SLOT, type ItemDefinitionSeed } from '@features/inventory/catalog';
import { ITEM_CATALOG } from '@features/inventory/catalog.data';

/**
 * The shipped catalog has to pass its own validator, and the validator has to reject the
 * mistakes a content edit actually makes. Both halves matter: a validator nothing runs
 * against real data drifts, and a catalog checked only by hand ships a duplicate token id
 * eventually.
 */

const EQUIPMENT: ItemDefinitionSeed = {
    itemType: '1',
    key: 'test_blade',
    category: 'equipment',
    slot: 'weapon',
    rarity: 3,
    effect: { kind: 'stat_bonus', hp: 0, atk: 5, def: 0, int: 0, mdef: 0 },
    name: 'Test Blade',
    description: 'For tests.',
};

const CONSUMABLE: ItemDefinitionSeed = {
    itemType: '100',
    key: 'test_tonic',
    category: 'consumable',
    rarity: 1,
    effect: { kind: 'grant_xp', amount: 50 },
    name: 'Test Tonic',
    description: 'For tests.',
};

/** The shipped item with `patch` applied, so each case states only what it changes. */
function variant(base: ItemDefinitionSeed, patch: Partial<ItemDefinitionSeed>): ItemDefinitionSeed[] {
    return [{ ...base, ...patch }];
}

describe('the shipped catalog', () => {
    it('validates', () => {
        expect(() => assertCatalog(ITEM_CATALOG)).not.toThrow();
    });

    it('covers every category the v1 scope ships', () => {
        const categories = new Set(ITEM_CATALOG.map((item) => item.category));
        expect(categories).toEqual(new Set(['equipment', 'consumable', 'collectible', 'material']));
    });

    it('covers all three equip slots, so no slot is defined but unreachable', () => {
        const slots = new Set(ITEM_CATALOG.filter((i) => i.slot).map((i) => SLOT[i.slot!]));
        expect(slots).toEqual(new Set([SLOT.weapon, SLOT.armor, SLOT.trinket]));
    });
});

describe('assertCatalog', () => {
    it('rejects two items sharing a token id, which would give one on-chain item two definitions', () => {
        expect(() => assertCatalog([EQUIPMENT, { ...CONSUMABLE, itemType: EQUIPMENT.itemType }])).toThrow(
            /duplicate item type/,
        );
    });

    it('rejects two items sharing a key, which makes seed data ambiguous', () => {
        expect(() => assertCatalog([EQUIPMENT, { ...CONSUMABLE, key: EQUIPMENT.key }])).toThrow(/duplicate item key/);
    });

    it('rejects token type 0, ItemCore’s empty-slot sentinel', () => {
        expect(() => assertCatalog(variant(EQUIPMENT, { itemType: '0' }))).toThrow(/positive decimal string/);
    });

    it('rejects equipment with no slot', () => {
        expect(() => assertCatalog(variant(EQUIPMENT, { slot: undefined }))).toThrow(/needs a slot/);
    });

    it('rejects a slot on anything that is not equipment', () => {
        expect(() => assertCatalog(variant(CONSUMABLE, { slot: 'weapon' }))).toThrow(/only equipment/);
    });

    it('rejects equipment carrying a consumable effect', () => {
        expect(() =>
            assertCatalog(variant(EQUIPMENT, { effect: { kind: 'grant_xp', amount: 10 } })),
        ).toThrow(/needs a stat_bonus/);
    });

    it('rejects a consumable carrying a stat bonus', () => {
        expect(() =>
            assertCatalog(
                variant(CONSUMABLE, { effect: { kind: 'stat_bonus', hp: 1, atk: 0, def: 0, int: 0, mdef: 0 } }),
            ),
        ).toThrow(/equipment effect/);
    });

    it('rejects an inert collectible that carries an effect', () => {
        expect(() =>
            assertCatalog([
                {
                    itemType: '200',
                    key: 'test_badge',
                    category: 'collectible',
                    rarity: 2,
                    effect: { kind: 'grant_xp', amount: 10 },
                    name: 'Test Badge',
                    description: 'For tests.',
                },
            ]),
        ).toThrow(/must not carry an effect/);
    });

    // Negative modifiers are excluded because the engine truncates to 16 bits with
    // wraparound rather than clamping, so one underflow produces a 65,000 HP pet.
    it('rejects a negative stat bonus', () => {
        expect(() =>
            assertCatalog(variant(EQUIPMENT, { effect: { kind: 'stat_bonus', hp: 0, atk: -5, def: 0, int: 0, mdef: 0 } })),
        ).toThrow(/must be an integer 0-/);
    });

    it('rejects a stat bonus past the sanity bound', () => {
        expect(() =>
            assertCatalog(
                variant(EQUIPMENT, { effect: { kind: 'stat_bonus', hp: 0, atk: 5000, def: 0, int: 0, mdef: 0 } }),
            ),
        ).toThrow(/must be an integer 0-/);
    });

    it('rejects a stat bonus that grants nothing, which would be a cosmetic', () => {
        expect(() =>
            assertCatalog(variant(EQUIPMENT, { effect: { kind: 'stat_bonus', hp: 0, atk: 0, def: 0, int: 0, mdef: 0 } })),
        ).toThrow(/grants nothing/);
    });

    it('rejects a rarity outside the five shared tiers', () => {
        expect(() => assertCatalog(variant(EQUIPMENT, { rarity: 6 }))).toThrow(/rarity must be 1-5/);
    });
});
