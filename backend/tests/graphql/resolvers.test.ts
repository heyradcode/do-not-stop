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
}));
// The overlay's own merge rule is covered in repositories/battleProgress.overlay.test.ts;
// here it is stubbed to a pass-through so these tests stay about resolver shaping.
vi.mock('@repositories/battleProgress.overlay', () => ({
    withBattleProgress: vi.fn(async (_chain: unknown, pets: unknown[]) => pets),
    findBattleProgress: vi.fn(async () => []),
}));

import { rootValue } from '../../src/graphql/resolvers';
import { findReadyOpponents, getPetById } from '@repositories/roster.repository';
import { findPetLeaderboard } from '@repositories/leaderboard.repository';
import { tryGrpcEstimateWin } from '../../src/grpc/estimateWin';

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
