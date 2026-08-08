import { describe, expect, it } from 'vitest';

import { checkEquipment, equipmentBonus } from '../../src/checks/equipment';
import {
    buildReceipt,
    GEARED_RULESET,
    gearedSnapshot,
    SNAPSHOT,
} from '../fixtures/signedReceipt';

import { SOURCE_DEFAULT_RULESET } from '@cryptopets/protocol';

/**
 * The check that makes a geared receipt checkable rather than merely self-consistent
 * (roadmap §4).
 *
 * The replay proves the fight followed from the numbers in the receipt. It cannot prove
 * those numbers were the right ones, because the inflated bonus would be the very thing
 * replayed against. Every case below is about that gap.
 */

const geared = () => buildReceipt({ snapshot: gearedSnapshot(), ruleset: GEARED_RULESET });

describe('checkEquipment', () => {
    it('passes when the applied modifiers match what the catalog declares', () => {
        expect(checkEquipment(geared(), GEARED_RULESET)).toEqual({ check: 'equipment', ok: true });
    });

    // Nothing to check is a pass, not a skip: a receipt with no gear has no gear claim to
    // be wrong about.
    it('passes an ungeared receipt', () => {
        expect(checkEquipment(buildReceipt(), SOURCE_DEFAULT_RULESET).ok).toBe(true);
    });

    // The case the check exists for. This receipt replays perfectly — the fight really did
    // use +50 ATK — and is still dishonest, because no item grants that.
    it('catches a modifier larger than the item declares', () => {
        const receipt = buildReceipt({
            snapshot: {
                ...gearedSnapshot(),
                attacker: {
                    ...gearedSnapshot().attacker,
                    equipment: [
                        { slot: 0, itemType: 1n, hp: 0, atk: 50, def: 0, int: 0, mdef: 0 },
                        { slot: 1, itemType: 11n, hp: 30, atk: 0, def: 10, int: 0, mdef: 0 },
                    ],
                },
            },
            ruleset: GEARED_RULESET,
        });

        const result = checkEquipment(receipt, GEARED_RULESET);

        expect(result.ok).toBe(false);
        expect(result.detail).toContain('atk applied 50');
        expect(result.detail).toContain('catalog declares 4');
    });

    // A modifier from nowhere: unauditable rather than merely unusual, since the ruleset
    // the receipt itself names never priced this item.
    it('catches an item the ruleset never priced', () => {
        const result = checkEquipment(geared(), SOURCE_DEFAULT_RULESET);

        expect(result.ok).toBe(false);
        expect(result.detail).toContain('is not in the ruleset');
    });

    it('catches an item worn in a slot the catalog does not put it in', () => {
        const base = gearedSnapshot();
        const receipt = buildReceipt({
            snapshot: {
                ...base,
                attacker: {
                    ...base.attacker,
                    // Armour declared for slot 1, worn in slot 2.
                    equipment: [{ slot: 2, itemType: 11n, hp: 30, atk: 0, def: 10, int: 0, mdef: 0 }],
                },
            },
            ruleset: GEARED_RULESET,
        });

        const result = checkEquipment(receipt, GEARED_RULESET);

        expect(result.ok).toBe(false);
        expect(result.detail).toContain('worn in slot 2');
    });

    it('reports the defender gear as well as the attacker gear', () => {
        const base = gearedSnapshot();
        const receipt = buildReceipt({
            snapshot: {
                ...base,
                attacker: SNAPSHOT.attacker,
                defender: {
                    ...base.defender,
                    equipment: [{ slot: 0, itemType: 999n, hp: 0, atk: 1, def: 0, int: 0, mdef: 0 }],
                },
            },
            ruleset: GEARED_RULESET,
        });

        expect(checkEquipment(receipt, GEARED_RULESET).detail).toContain('defender');
    });
});

describe('equipmentBonus', () => {
    it('totals every attribute across the worn items', () => {
        expect(equipmentBonus(gearedSnapshot().attacker.equipment)).toEqual({
            hp: 30, atk: 4, def: 10, int: 0, mdef: 0,
        });
    });

    it('treats absent equipment as no bonus', () => {
        expect(equipmentBonus(undefined)).toEqual({ hp: 0, atk: 0, def: 0, int: 0, mdef: 0 });
    });
});
