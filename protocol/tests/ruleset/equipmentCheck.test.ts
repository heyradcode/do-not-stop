import { describe, expect, it } from 'vitest';

import { findEquipmentMismatches } from '../../src/ruleset/equipmentCheck';
import { SOURCE_DEFAULT_RULESET, type Ruleset } from '../../src/ruleset/types';

/**
 * The comparison that holds a snapshot's frozen modifiers to the ruleset that priced them
 * (roadmap §4, threat T13).
 *
 * Tested here rather than only through its callers because it now has two, and they use it
 * for opposite purposes: the verifier reports on a finished receipt, the backend refuses a
 * battle before it starts. Both have to reach the same verdict on the same inputs, so the
 * verdict belongs in one place with its own tests.
 */

const SWORD = { itemType: 3n, slot: 0, hp: 0, atk: 22, def: 0, int: 0, mdef: 0 };
const PLATE = { itemType: 12n, slot: 1, hp: 45, atk: 0, def: 16, int: 0, mdef: 6 };

const ruleset: Ruleset = { ...SOURCE_DEFAULT_RULESET, itemCatalog: [SWORD, PLATE] };

/** One worn item, in the shape a snapshot carries it. */
const worn = (item: typeof SWORD) => ({ slot: item.slot, itemType: item.itemType, hp: item.hp, atk: item.atk, def: item.def, int: item.int, mdef: item.mdef });

describe('findEquipmentMismatches', () => {
    it('accepts gear priced exactly as the catalog declares', () => {
        expect(
            findEquipmentMismatches([{ role: 'attacker', equipment: [worn(SWORD), worn(PLATE)] }], ruleset),
        ).toEqual([]);
    });

    it('accepts an ungeared pet, however the absence is spelled', () => {
        expect(findEquipmentMismatches([{ role: 'attacker' }], ruleset)).toEqual([]);
        expect(findEquipmentMismatches([{ role: 'attacker', equipment: undefined }], ruleset)).toEqual([]);
        expect(findEquipmentMismatches([{ role: 'attacker', equipment: [] }], ruleset)).toEqual([]);
    });

    // The attack this exists for. An inflated bonus replays perfectly, because it is the
    // very number being replayed against, so replay alone can never catch it.
    it('catches an inflated modifier and names both numbers', () => {
        const [mismatch] = findEquipmentMismatches(
            [{ role: 'attacker', equipment: [{ ...worn(SWORD), atk: 50 }] }],
            ruleset,
        );

        expect(mismatch).toBe('attacker item 3: atk applied 50, catalog declares 22');
    });

    it('catches an item the ruleset never priced', () => {
        const [mismatch] = findEquipmentMismatches(
            [{ role: 'defender', equipment: [{ ...worn(SWORD), itemType: 999n }] }],
            ruleset,
        );

        expect(mismatch).toBe("defender slot 0: item 999 is not in the ruleset's catalog");
    });

    it('catches an item worn in a slot the catalog does not put it in', () => {
        const [mismatch] = findEquipmentMismatches(
            [{ role: 'attacker', equipment: [{ ...worn(SWORD), slot: 2 }] }],
            ruleset,
        );

        expect(mismatch).toBe('attacker item 3: worn in slot 2, catalog says slot 0');
    });

    it('reports every mismatch rather than stopping at the first', () => {
        // A caller deciding whether to refuse a battle wants the whole disagreement in one
        // message, not to rediscover it one field at a time.
        const mismatches = findEquipmentMismatches(
            [
                { role: 'attacker', equipment: [{ ...worn(SWORD), atk: 50, hp: 7 }] },
                { role: 'defender', equipment: [{ ...worn(PLATE), def: 99 }] },
            ],
            ruleset,
        );

        expect(mismatches).toHaveLength(3);
        expect(mismatches.filter((m) => m.startsWith('attacker'))).toHaveLength(2);
        expect(mismatches.filter((m) => m.startsWith('defender'))).toHaveLength(1);
    });

    // A ruleset with no catalog is every version 1 ruleset. Gear against one is not
    // "unpriced by omission", it is gear that ruleset cannot account for at all.
    it('treats an absent catalog as pricing nothing', () => {
        expect(
            findEquipmentMismatches([{ role: 'attacker', equipment: [worn(SWORD)] }], {
                ...SOURCE_DEFAULT_RULESET,
                itemCatalog: [],
            }),
        ).toHaveLength(1);
    });
});
