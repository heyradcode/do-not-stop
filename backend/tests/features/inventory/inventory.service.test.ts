import { beforeEach, describe, expect, it, vi } from 'vitest';

const repo = {
    findAllDefinitions: vi.fn(),
    findBalances: vi.fn(),
    findDefinitions: vi.fn(),
    findEquipment: vi.fn(),
    findUnclaimedEntitlements: vi.fn(),
};

vi.mock('@repositories/inventory.repository', () => ({
    findAllDefinitions: () => repo.findAllDefinitions(),
    findBalances: (chain: string, owner: string) => repo.findBalances(chain, owner),
    findDefinitions: (itemTypes: string[]) => repo.findDefinitions(itemTypes),
    findEquipment: (chain: string, petId: string) => repo.findEquipment(chain, petId),
    findUnclaimedEntitlements: (chain: string, owner: string) => repo.findUnclaimedEntitlements(chain, owner),
}));

import { getInventory, getPendingItems, getPetEquipment } from '@features/inventory';

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
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('getInventory', () => {
    it('joins balances onto the catalog', async () => {
        repo.findBalances.mockResolvedValue([{ itemType: '100', quantity: 3n }]);
        repo.findDefinitions.mockResolvedValue([POTION]);

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
        repo.findDefinitions.mockResolvedValue([POTION]);

        const entries = await getInventory('evm', '0xabc');

        expect(entries[0]!.quantity).toBe('9007199254740993');
    });

    it('hides a held item that is not in the catalog rather than showing a blank tile', async () => {
        repo.findBalances.mockResolvedValue([
            { itemType: '100', quantity: 1n },
            { itemType: '999', quantity: 5n },
        ]);
        repo.findDefinitions.mockResolvedValue([POTION]);

        const entries = await getInventory('evm', '0xabc');

        expect(entries).toHaveLength(1);
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('999'));
    });

    it('skips the catalog fetch entirely for an empty bag', async () => {
        repo.findBalances.mockResolvedValue([]);
        expect(await getInventory('evm', '0xabc')).toEqual([]);
        expect(repo.findDefinitions).not.toHaveBeenCalled();
    });

    // An unreadable payload costs that item its effect, not the whole page: this is a read
    // path, and the only writer is the seeder, so it means stored shape and reader diverged.
    it('keeps an item whose effect payload no longer parses, minus the effect', async () => {
        repo.findBalances.mockResolvedValue([{ itemType: '100', quantity: 1n }]);
        repo.findDefinitions.mockResolvedValue([{ ...POTION, effect: { kind: 'teleport' } }]);

        const entries = await getInventory('evm', '0xabc');

        expect(entries).toHaveLength(1);
        expect(entries[0]!.item.effect).toBeNull();
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('unreadable effect'));
    });
});

describe('getPetEquipment', () => {
    it('returns filled slots joined to the catalog', async () => {
        repo.findEquipment.mockResolvedValue([{ slot: 0, itemType: '1' }]);
        repo.findDefinitions.mockResolvedValue([BLADE]);

        expect(await getPetEquipment('evm', '7')).toEqual([
            { slot: 0, item: expect.objectContaining({ key: 'iron_fang' }) },
        ]);
    });

    it('returns nothing for a pet with no gear', async () => {
        repo.findEquipment.mockResolvedValue([]);
        expect(await getPetEquipment('evm', '7')).toEqual([]);
        expect(repo.findDefinitions).not.toHaveBeenCalled();
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
        repo.findDefinitions.mockResolvedValue([POTION]);

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
        repo.findDefinitions.mockResolvedValue([]);

        expect(await getPendingItems('evm', '0xabc')).toEqual([]);
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('e1'));
    });

    it('skips the catalog fetch when nothing is waiting', async () => {
        repo.findUnclaimedEntitlements.mockResolvedValue([]);
        expect(await getPendingItems('evm', '0xabc')).toEqual([]);
        expect(repo.findDefinitions).not.toHaveBeenCalled();
    });
});
