import { beforeEach, describe, expect, it, vi } from 'vitest';

const repo = {
    findAllDefinitions: vi.fn(),
    findBalances: vi.fn(),
    findEquipment: vi.fn(),
    findUnclaimedEntitlements: vi.fn(),
};

vi.mock('@repositories/inventory.repository', () => ({
    findAllDefinitions: () => repo.findAllDefinitions(),
    findBalances: (chain: string, owner: string) => repo.findBalances(chain, owner),
    findEquipment: (chain: string, petId: string) => repo.findEquipment(chain, petId),
    findUnclaimedEntitlements: (chain: string, owner: string) => repo.findUnclaimedEntitlements(chain, owner),
}));

import {
    getCatalog,
    getCombatCatalog,
    getInventory,
    getPendingItems,
    getPetEquipment,
    getPetEquipmentForCombat,
    ItemCatalogError,
    itemCatalogGeneration,
    resetItemCatalog,
} from '@features/inventory';

const POTION = {
    itemType: '100',
    key: 'xp_potion_i',
    category: 'consumable',
    slot: null,
    rarity: 1,
    effect: { kind: 'grant_xp', amount: 50 },
    name: 'Lesser Tonic',
    description: 'Tastes of copper.',
};

const BLADE = {
    itemType: '1',
    key: 'iron_fang',
    category: 'equipment',
    slot: 0,
    rarity: 1,
    effect: { kind: 'stat_bonus', hp: 0, atk: 4, def: 0, int: 0, mdef: 0 },
    name: 'Iron Fang',
    description: 'A blunt starter blade.',
};

beforeEach(() => {
    vi.clearAllMocks();
    // The catalog is cached for the process's life, so it has to be dropped between cases or
    // the first one's fixture answers all the rest.
    resetItemCatalog();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('getInventory', () => {
    it('joins balances onto the catalog', async () => {
        repo.findBalances.mockResolvedValue([{ itemType: '100', quantity: 3n }]);
        repo.findAllDefinitions.mockResolvedValue([POTION]);

        const entries = await getInventory('evm', '0xABC');

        expect(entries).toEqual([
            { item: expect.objectContaining({ key: 'xp_potion_i', effect: { kind: 'grant_xp', amount: 50 } }), quantity: '3' },
        ]);
    });

    // The rows indexer-go writes are lowercased, so an unnormalized lookup key would return
    // an empty bag rather than an error, which reads as "you own nothing".
    it('folds an EVM owner to lowercase before looking anything up', async () => {
        repo.findBalances.mockResolvedValue([]);
        await getInventory('evm', '0xAbC0000000000000000000000000000000000DEF');
        expect(repo.findBalances).toHaveBeenCalledWith('evm', '0xabc0000000000000000000000000000000000def');
    });

    // Case-folding base58 would merge two distinct Solana pubkeys into one player, so
    // normalization deliberately only applies to a full 20-byte EVM address.
    it('leaves a Solana pubkey unfolded', async () => {
        repo.findBalances.mockResolvedValue([]);
        await getInventory('solana', 'So11111111111111111111111111111111111111112');
        expect(repo.findBalances).toHaveBeenCalledWith('solana', 'So11111111111111111111111111111111111111112');
    });

    // A uint256 balance does not fit a JS number, so it has to leave as a string.
    it('serializes the quantity as a string', async () => {
        repo.findBalances.mockResolvedValue([{ itemType: '100', quantity: 9007199254740993n }]);
        repo.findAllDefinitions.mockResolvedValue([POTION]);

        const entries = await getInventory('evm', '0xabc');

        expect(entries[0]!.quantity).toBe('9007199254740993');
    });

    it('hides a held item that is not in the catalog rather than showing a blank tile', async () => {
        repo.findBalances.mockResolvedValue([
            { itemType: '100', quantity: 1n },
            { itemType: '999', quantity: 5n },
        ]);
        repo.findAllDefinitions.mockResolvedValue([POTION]);

        const entries = await getInventory('evm', '0xabc');

        expect(entries).toHaveLength(1);
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('999'));
    });

    it('skips the catalog fetch entirely for an empty bag', async () => {
        repo.findBalances.mockResolvedValue([]);
        expect(await getInventory('evm', '0xabc')).toEqual([]);
        expect(repo.findAllDefinitions).not.toHaveBeenCalled();
    });

    // An unreadable payload costs that item its effect, not the whole page: this is a read
    // path, and the only writer is the seeder, so it means stored shape and reader diverged.
    it('keeps an item whose effect payload no longer parses, minus the effect', async () => {
        repo.findBalances.mockResolvedValue([{ itemType: '100', quantity: 1n }]);
        repo.findAllDefinitions.mockResolvedValue([{ ...POTION, effect: { kind: 'teleport' } }]);

        const entries = await getInventory('evm', '0xabc');

        expect(entries).toHaveLength(1);
        expect(entries[0]!.item.effect).toBeNull();
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('unreadable effect'));
    });
});

describe('getPetEquipment', () => {
    it('returns filled slots joined to the catalog', async () => {
        repo.findEquipment.mockResolvedValue([{ slot: 0, itemType: '1' }]);
        repo.findAllDefinitions.mockResolvedValue([BLADE]);

        expect(await getPetEquipment('evm', '7')).toEqual([
            { slot: 0, item: expect.objectContaining({ key: 'iron_fang' }) },
        ]);
    });

    it('returns nothing for a pet with no gear', async () => {
        repo.findEquipment.mockResolvedValue([]);
        expect(await getPetEquipment('evm', '7')).toEqual([]);
        expect(repo.findAllDefinitions).not.toHaveBeenCalled();
    });
});

/**
 * The strict counterparts (roadmap §4).
 *
 * `getPetEquipment` and `getCatalog` hide a row they cannot read, which is right for a bag
 * and wrong for a fight: dropping an item silently changes a battle rather than a label,
 * and the resulting receipt claims a pet fought bare while `ItemCore.equipmentOf` at the
 * recorded `sourceVersion` says it was wearing something.
 *
 * An unreadable effect and an absent one are the same `null` on `ItemView`, so each case
 * below is checked against a lenient read as well, to show the two paths genuinely differ
 * rather than the fixture simply being malformed everywhere.
 */
describe('the combat reads refuse what the display reads hide', () => {
    /** Equipment whose stored effect will not parse: `atk` is a string, not an integer. */
    const CORRUPT_BLADE = { ...BLADE, itemType: '2', key: 'bent_fang', effect: { kind: 'stat_bonus', hp: 0, atk: '4', def: 0, int: 0, mdef: 0 } };

    describe('getCombatCatalog', () => {
        it('returns the catalog when every equipment row is readable', async () => {
            repo.findAllDefinitions.mockResolvedValue([BLADE, POTION]);

            expect((await getCombatCatalog()).map((item) => item.key)).toEqual(['iron_fang', 'xp_potion_i']);
        });

        it('refuses an equipment row whose modifier will not parse', async () => {
            repo.findAllDefinitions.mockResolvedValue([BLADE, CORRUPT_BLADE]);

            await expect(getCombatCatalog()).rejects.toThrow(ItemCatalogError);
            // The lenient read still serves it, effect dropped. That difference is the
            // point: a bad row costs a tooltip on the bag screen and costs a battle here.
            expect((await getCatalog()).find((item) => item.key === 'bent_fang')?.effect).toBeNull();
        });

        it('ignores an unreadable effect on something that cannot reach a fight', async () => {
            // A consumable's effect is applied by `useItem`, never by the engine, so it has
            // no business invalidating the ruleset every battle is priced under.
            repo.findAllDefinitions.mockResolvedValue([BLADE, { ...POTION, effect: { kind: 'grant_xp', amount: 'fifty' } }]);

            await expect(getCombatCatalog()).resolves.toHaveLength(2);
        });
    });

    describe('getPetEquipmentForCombat', () => {
        it('narrows a readable item to its modifier', async () => {
            repo.findEquipment.mockResolvedValue([{ slot: 0, itemType: '1' }]);
            repo.findAllDefinitions.mockResolvedValue([BLADE]);

            expect(await getPetEquipmentForCombat('evm', '7')).toEqual([
                { slot: 0, itemType: '1', key: 'iron_fang', bonus: { kind: 'stat_bonus', hp: 0, atk: 4, def: 0, int: 0, mdef: 0 } },
            ]);
        });

        it('refuses an equipped item with no catalog row', async () => {
            // The seeder running behind the contract. Refusing surfaces it in seconds; the
            // lenient read hides it behind a console warning and an ungeared fight.
            repo.findEquipment.mockResolvedValue([{ slot: 0, itemType: '999' }]);
            repo.findAllDefinitions.mockResolvedValue([BLADE]);

            await expect(getPetEquipmentForCombat('evm', '7')).rejects.toThrow(/uncatalogued item type 999/);
            expect(await getPetEquipment('evm', '7')).toEqual([]);
        });

        it('refuses an equipped item whose modifier will not parse', async () => {
            repo.findEquipment.mockResolvedValue([{ slot: 0, itemType: '2' }]);
            repo.findAllDefinitions.mockResolvedValue([CORRUPT_BLADE]);

            await expect(getPetEquipmentForCombat('evm', '7')).rejects.toThrow(/no readable stat_bonus/);
        });

        it('costs nothing for a pet with no gear', async () => {
            repo.findEquipment.mockResolvedValue([]);

            expect(await getPetEquipmentForCombat('evm', '7')).toEqual([]);
            expect(repo.findAllDefinitions).not.toHaveBeenCalled();
        });
    });
});

describe('resetItemCatalog', () => {
    // The contract `servedRuleset` memoizes against. It cannot call this module's reset
    // directly (ruleset.builder imports this one, so the call would close a cycle), so it
    // compares generations instead, and a reset that did not bump one would leave a ruleset
    // built from rows that no longer exist.
    it('bumps the generation so catalog-derived caches rebuild', async () => {
        repo.findAllDefinitions.mockResolvedValue([BLADE]);
        await getCatalog();

        const before = itemCatalogGeneration();
        resetItemCatalog();

        expect(itemCatalogGeneration()).not.toBe(before);
    });

    it('re-reads the definitions after a reset', async () => {
        repo.findAllDefinitions.mockResolvedValue([BLADE]);
        await getCatalog();
        await getCatalog();
        expect(repo.findAllDefinitions).toHaveBeenCalledTimes(1);

        resetItemCatalog();
        await getCatalog();
        expect(repo.findAllDefinitions).toHaveBeenCalledTimes(2);
    });
});

describe('getPendingItems', () => {
    const row = {
        id: 'e1',
        itemType: '100',
        quantity: 2,
        source: 'battle_drop',
        sourceRef: 'btl_0001',
        createdAt: new Date('2026-08-07T00:00:00.000Z'),
    };

    it('joins entitlements onto the catalog and names what paid them', async () => {
        repo.findUnclaimedEntitlements.mockResolvedValue([row]);
        repo.findAllDefinitions.mockResolvedValue([POTION]);

        expect(await getPendingItems('evm', '0xabc')).toEqual([
            {
                entitlementId: 'e1',
                item: expect.objectContaining({ key: 'xp_potion_i' }),
                quantity: 2,
                source: 'battle_drop',
                sourceRef: 'btl_0001',
                createdAt: '2026-08-07T00:00:00.000Z',
            },
        ]);
    });

    // Same normalization rule as the bag: rows are written lowercased, so an unnormalized
    // key would report nothing waiting rather than erroring.
    it('folds an EVM owner before looking anything up', async () => {
        repo.findUnclaimedEntitlements.mockResolvedValue([]);
        await getPendingItems('evm', '0xAbC0000000000000000000000000000000000DEF');
        expect(repo.findUnclaimedEntitlements).toHaveBeenCalledWith(
            'evm',
            '0xabc0000000000000000000000000000000000def',
        );
    });

    it('hides an entitlement naming an item the catalog does not have', async () => {
        repo.findUnclaimedEntitlements.mockResolvedValue([{ ...row, itemType: '999' }]);
        repo.findAllDefinitions.mockResolvedValue([]);

        expect(await getPendingItems('evm', '0xabc')).toEqual([]);
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('e1'));
    });

    it('skips the catalog fetch when nothing is waiting', async () => {
        repo.findUnclaimedEntitlements.mockResolvedValue([]);
        expect(await getPendingItems('evm', '0xabc')).toEqual([]);
        expect(repo.findAllDefinitions).not.toHaveBeenCalled();
    });
});
