import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@config/prisma', () => ({
    prisma: { battleHistory: { upsert: vi.fn(), findMany: vi.fn() } },
}));

import { recordBattle, getHeadToHead, getRecentForm } from '../../../src/repositories/history.repository';
import { prisma } from '@config/prisma';

beforeEach(() => { vi.clearAllMocks(); });

describe('recordBattle', () => {
    it('upserts keyed by chain+battleId', async () => {
        vi.mocked(prisma.battleHistory.upsert).mockResolvedValue({} as never);
        const rec = { chain: 'evm' as const, battleId: 'b1', attacker: 'p1', defender: 'p2', winnerPetId: 'p1', foughtAt: 1000n };
        await recordBattle(rec);
        expect(prisma.battleHistory.upsert).toHaveBeenCalledWith(
            expect.objectContaining({ where: { chain_battleId: { chain: 'evm', battleId: 'b1' } } }),
        );
    });
});

describe('getHeadToHead', () => {
    it('tallies wins correctly', async () => {
        vi.mocked(prisma.battleHistory.findMany).mockResolvedValue([
            { winnerPetId: 'p1' },
            { winnerPetId: 'p2' },
            { winnerPetId: 'p1' },
        ] as never);
        const result = await getHeadToHead('evm', 'p1', 'p2');
        expect(result.total).toBe(3);
        expect(result.winsByPet['p1']).toBe(2);
        expect(result.winsByPet['p2']).toBe(1);
    });

    it('returns zeros when no history exists', async () => {
        vi.mocked(prisma.battleHistory.findMany).mockResolvedValue([]);
        const result = await getHeadToHead('evm', 'p1', 'p2');
        expect(result.total).toBe(0);
        expect(result.winsByPet['p1']).toBe(0);
    });

    it('excludes the given battleId', async () => {
        vi.mocked(prisma.battleHistory.findMany).mockResolvedValue([]);
        await getHeadToHead('evm', 'p1', 'p2', 'exclude-me');
        expect(prisma.battleHistory.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ battleId: { not: 'exclude-me' } }),
            }),
        );
    });
});

describe('getRecentForm', () => {
    it('counts wins and losses correctly', async () => {
        vi.mocked(prisma.battleHistory.findMany).mockResolvedValue([
            { winnerPetId: 'p1' },
            { winnerPetId: 'p2' },
            { winnerPetId: 'p1' },
        ] as never);
        const result = await getRecentForm('evm', 'p1');
        expect(result.total).toBe(3);
        expect(result.wins).toBe(2);
        expect(result.losses).toBe(1);
    });

    it('returns zeros when no history exists', async () => {
        vi.mocked(prisma.battleHistory.findMany).mockResolvedValue([]);
        const result = await getRecentForm('evm', 'p1');
        expect(result).toEqual({ total: 0, wins: 0, losses: 0 });
    });
});
