import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@repositories/roster.repository', () => ({
    findReadyOpponents: vi.fn(),
    getPetById: vi.fn(),
}));
vi.mock('../../src/grpc/estimateWin', () => ({
    tryGrpcEstimateWin: vi.fn(),
}));
vi.mock('@repositories/leaderboard.repository', () => ({
    findPetLeaderboard: vi.fn(),
    findPlayerLeaderboard: vi.fn(),
    findPlayerRank: vi.fn(),
}));
// The overlay's own merge rule is covered in repositories/battleProgress.overlay.test.ts;
// here it is stubbed to a pass-through so these tests stay about resolver shaping.
vi.mock('@repositories/battleProgress.overlay', () => ({
    withBattleProgress: vi.fn(async (_chain: unknown, pets: unknown[]) => pets),
    findBattleProgress: vi.fn(async () => []),
}));
// The service's own join rule is covered in features/inventory/inventory.service.test.ts;
// stubbed here so these tests stay about resolver shaping and the session-owner rule.
vi.mock('@features/inventory', () => ({
    getCatalog: vi.fn(),
    getInventory: vi.fn(),
    getPetEquipment: vi.fn(),
}));

import { rootValue } from '../../src/graphql/resolvers';
import { findReadyOpponents, getPetById } from '@repositories/roster.repository';
import {
    findPetLeaderboard,
    findPlayerLeaderboard,
    findPlayerRank,
} from '@repositories/leaderboard.repository';
import { tryGrpcEstimateWin } from '../../src/grpc/estimateWin';
import { getCatalog, getInventory, getPetEquipment } from '@features/inventory';

const ctx = { caller: '0xcaller' };

const rosterPet = {
    petId: '42',
    name: 'Rex',
    level: 5,
    rarity: 1,
    winCount: 3,
    lossCount: 1,
    readyAt: 0n,
    breedReadyAt: 0n,
    trainReadyAt: 0n,
    ownerAddress: '0xowner',
    chain: 'evm',
    xp: 0,
    speciesId: 1,
};

beforeEach(() => { vi.clearAllMocks(); });

describe('opponents resolver', () => {
    it('returns mapped opponents list', async () => {
        vi.mocked(findReadyOpponents).mockResolvedValue({ rows: [rosterPet], total: 1 });
        const result = await rootValue.opponents({ chain: 'evm' }, ctx);
        expect(result.total).toBe(1);
        expect(result.opponents[0].id).toBe('42');
        expect(result.opponents[0].readyAt).toBe(0);
    });

    it('throws for an unsupported chain', async () => {
        await expect(rootValue.opponents({ chain: 'tron' }, ctx)).rejects.toThrow('chain must be one of');
    });

    it('clamps pageSize to MAX_PAGE_SIZE=50', async () => {
        vi.mocked(findReadyOpponents).mockResolvedValue({ rows: [], total: 0 });
        await rootValue.opponents({ chain: 'evm', pageSize: 999 }, ctx);
        const { pageSize } = vi.mocked(findReadyOpponents).mock.calls[0][0];
        expect(pageSize).toBe(50);
    });
});

describe('leaderboard resolver', () => {
    const entry = {
        rank: 1,
        chain: 'evm',
        petId: '42',
        owner: '0xowner',
        name: 'Rex',
        level: 5,
        rarity: 1,
        dna: '123',
        winCount: 3,
        lossCount: 1,
        asset: '',
    };

    it('renames petId to id and passes the page through', async () => {
        vi.mocked(findPetLeaderboard).mockResolvedValue({ entries: [entry], total: 1 });

        const result = await rootValue.leaderboard({ chain: 'evm', page: 1 }, ctx);

        expect(result.total).toBe(1);
        expect(result.page).toBe(1);
        expect(result.entries[0]).toMatchObject({ id: '42', rank: 1 });
        expect(result.entries[0]).not.toHaveProperty('petId');
    });

    it('throws for an unsupported chain', async () => {
        await expect(rootValue.leaderboard({ chain: 'tron' }, ctx)).rejects.toThrow('chain must be one of');
    });

    it('clamps pageSize to MAX_PAGE_SIZE=50', async () => {
        vi.mocked(findPetLeaderboard).mockResolvedValue({ entries: [], total: 0 });
        await rootValue.leaderboard({ chain: 'evm', pageSize: 999 }, ctx);
        expect(vi.mocked(findPetLeaderboard).mock.calls[0][0].pageSize).toBe(50);
    });
});

describe('playerLeaderboard resolver', () => {
    const entry = { rank: 1, owner: '0xowner', winCount: 20, lossCount: 4, petCount: 3 };

    it('passes the page through unchanged (no petId to rename here)', async () => {
        vi.mocked(findPlayerLeaderboard).mockResolvedValue({ entries: [entry], total: 1 });

        const result = await rootValue.playerLeaderboard({ chain: 'evm', page: 2 }, ctx);

        expect(result.total).toBe(1);
        expect(result.page).toBe(2);
        expect(result.entries[0]).toEqual(entry);
    });

    it('throws for an unsupported chain', async () => {
        await expect(rootValue.playerLeaderboard({ chain: 'tron' }, ctx)).rejects.toThrow('chain must be one of');
    });

    it('clamps pageSize to MAX_PAGE_SIZE=50', async () => {
        vi.mocked(findPlayerLeaderboard).mockResolvedValue({ entries: [], total: 0 });
        await rootValue.playerLeaderboard({ chain: 'evm', pageSize: 999 }, ctx);
        expect(vi.mocked(findPlayerLeaderboard).mock.calls[0][0].pageSize).toBe(50);
    });
});

describe('playerRank resolver', () => {
    it('ranks the session wallet, not an argument', async () => {
        // The owner comes from the JWT context, so this cannot be pointed at someone
        // else's wallet to enumerate their standing.
        vi.mocked(findPlayerRank).mockResolvedValue(null);

        await rootValue.playerRank({ chain: 'evm' }, { caller: '0xme' });

        expect(findPlayerRank).toHaveBeenCalledWith('evm', '0xme');
    });

    it('returns null for an unranked caller rather than a zeroed row', async () => {
        vi.mocked(findPlayerRank).mockResolvedValue(null);
        expect(await rootValue.playerRank({ chain: 'evm' }, ctx)).toBeNull();
    });

    it('throws for an unsupported chain', async () => {
        await expect(rootValue.playerRank({ chain: 'tron' }, ctx)).rejects.toThrow('chain must be one of');
    });
});

describe('pet resolver', () => {
    it('returns the mapped pet when found', async () => {
        vi.mocked(getPetById).mockResolvedValue(rosterPet);
        const result = await rootValue.pet({ chain: 'evm', id: '42' });
        expect(result?.id).toBe('42');
        expect(result?.readyAt).toBe(0);
    });

    it('returns null when the pet does not exist', async () => {
        vi.mocked(getPetById).mockResolvedValue(null);
        expect(await rootValue.pet({ chain: 'evm', id: '99' })).toBeNull();
    });

    it('throws for unsupported chain', async () => {
        await expect(rootValue.pet({ chain: 'tron', id: '1' })).rejects.toThrow('chain must be one of');
    });
});

describe('winEstimate resolver', () => {
    it('delegates to tryGrpcEstimateWin and returns the result', async () => {
        vi.mocked(tryGrpcEstimateWin).mockResolvedValue(0.65);
        const result = await rootValue.winEstimate({ chain: 'evm', petId1: 'p1', petId2: 'p2' });
        expect(result).toBe(0.65);
    });

    it('caps samples at MAX_WIN_SAMPLES=10000', async () => {
        vi.mocked(tryGrpcEstimateWin).mockResolvedValue(null);
        await rootValue.winEstimate({ chain: 'evm', petId1: 'p1', petId2: 'p2', samples: 99999 });
        expect(tryGrpcEstimateWin).toHaveBeenCalledWith(
            expect.objectContaining({ samples: 10000 }),
        );
    });

    it('throws for unsupported chain', async () => {
        await expect(rootValue.winEstimate({ chain: 'tron', petId1: 'p1', petId2: 'p2' })).rejects.toThrow('chain must be one of');
    });
});

// ─── inventory (roadmap §4) ──────────────────────────────────────────────────

const POTION = {
    itemType: '100',
    key: 'xp_potion_i',
    category: 'consumable',
    slot: null,
    rarity: 1,
    effect: { kind: 'grant_xp' as const, amount: 50 },
    name: 'Lesser Tonic',
    description: 'Tastes of copper.',
};

const INERT = { ...POTION, itemType: '200', key: 'crate_key', category: 'collectible', effect: null };

describe('itemCatalog', () => {
    it('serializes the effect payload to a JSON string', async () => {
        vi.mocked(getCatalog).mockResolvedValue([POTION]);

        const [entry] = await rootValue.itemCatalog();

        expect(entry).toMatchObject({ itemType: '100', key: 'xp_potion_i' });
        expect(JSON.parse(entry!.effect!)).toEqual({ kind: 'grant_xp', amount: 50 });
    });

    it('leaves an inert item’s effect null rather than the string "null"', async () => {
        vi.mocked(getCatalog).mockResolvedValue([INERT]);
        expect((await rootValue.itemCatalog())[0]!.effect).toBeNull();
    });
});

describe('inventory', () => {
    it('reads the owner from the session, not from an argument', async () => {
        vi.mocked(getInventory).mockResolvedValue([{ item: POTION, quantity: '3' }]);

        const entries = await rootValue.inventory({ chain: 'evm' }, ctx);

        expect(getInventory).toHaveBeenCalledWith('evm', '0xcaller');
        expect(entries).toEqual([{ item: expect.objectContaining({ key: 'xp_potion_i' }), quantity: '3' }]);
    });

    // "Owns nothing" rather than an error, matching how playerRank treats no standing.
    it('returns an empty bag for an unauthenticated caller without querying', async () => {
        expect(await rootValue.inventory({ chain: 'evm' }, { caller: '' })).toEqual([]);
        expect(getInventory).not.toHaveBeenCalled();
    });

    it('rejects an unsupported chain', async () => {
        await expect(rootValue.inventory({ chain: 'dogecoin' }, ctx)).rejects.toThrow(/chain must be one of/);
    });
});

describe('petEquipment', () => {
    it('returns filled slots with their definitions', async () => {
        vi.mocked(getPetEquipment).mockResolvedValue([{ slot: 0, item: POTION }]);

        expect(await rootValue.petEquipment({ chain: 'evm', petId: '7' }, ctx)).toEqual([
            { slot: 0, item: expect.objectContaining({ key: 'xp_potion_i' }) },
        ]);
    });

    it('rejects an unsupported chain', async () => {
        await expect(rootValue.petEquipment({ chain: 'dogecoin', petId: '7' }, ctx)).rejects.toThrow(
            /chain must be one of/,
        );
    });
});
