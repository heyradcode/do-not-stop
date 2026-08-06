import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@config/prisma', () => ({
    prisma: {
        petRoster: {
            findMany: vi.fn(),
            count: vi.fn(),
        },
        $queryRaw: vi.fn(),
    },
}));

const servedChainIdForFamily = vi.fn(() => 'eip155:31337' as string | null);
vi.mock('../../src/repositories/battleProgress.overlay', () => ({
    servedChainIdForFamily: (chain: string) => servedChainIdForFamily(chain),
}));

import { findPetLeaderboard } from '../../src/repositories/leaderboard.repository';
import { prisma } from '@config/prisma';

const rankedRow = {
    chain: 'evm',
    petId: '7',
    owner: '0xowner',
    name: 'Rex',
    level: 9,
    rarity: 3,
    dna: '123',
    winCount: 12,
    lossCount: 2,
    asset: '',
};

/** `$queryRaw` is called twice per page: the rows, then their count. */
function mockJoinQuery(rows: unknown[], total: number) {
    vi.mocked(prisma.$queryRaw)
        .mockResolvedValueOnce(rows as never)
        .mockResolvedValueOnce([{ total: BigInt(total) }] as never);
}

/** The SQL text of the nth `$queryRaw` call, whitespace-collapsed for matching. */
function sqlOfCall(index: number): string {
    const [template] = vi.mocked(prisma.$queryRaw).mock.calls[index] as unknown as [string[]];
    return template.join(' ? ').replace(/\s+/g, ' ');
}

beforeEach(() => {
    vi.clearAllMocks();
    servedChainIdForFamily.mockReturnValue('eip155:31337');
});

describe('findPetLeaderboard', () => {
    it('returns the ranked rows and their total', async () => {
        mockJoinQuery([rankedRow], 1);

        const result = await findPetLeaderboard({ chain: 'evm', page: 0, pageSize: 20 });

        expect(result.total).toBe(1);
        expect(result.entries[0].petId).toBe('7');
        expect(result.entries[0].rank).toBe(1);
    });

    it('numbers ranks absolutely, continuing across pages', async () => {
        // A rank that restarted at 1 on every page would say the 21st pet is the best one.
        mockJoinQuery([rankedRow, { ...rankedRow, petId: '8' }], 42);

        const result = await findPetLeaderboard({ chain: 'evm', page: 2, pageSize: 20 });

        expect(result.entries.map((entry) => entry.rank)).toEqual([41, 42]);
    });

    it('ranks on the merged battle record, not the frozen roster counters', async () => {
        // The roster's win/loss stopped moving when battles left the chain, so ordering on
        // r.win_count alone would freeze the leaderboard at the retired path's last state.
        mockJoinQuery([], 0);

        await findPetLeaderboard({ chain: 'evm', page: 0, pageSize: 20 });

        const sql = sqlOfCall(0);
        expect(sql).toContain('LEFT JOIN pet_battle_progress p');
        expect(sql).toContain('ORDER BY COALESCE(p.win_count, r.win_count) DESC');
        expect(sql).toContain('COALESCE(p.loss_count, r.loss_count) ASC');
        expect(sql).toContain('GREATEST(r.level, COALESCE(p.level, 0)) DESC');
        expect(sql).toContain('r.pet_id ASC');
    });

    it('excludes pets that have never fought, in the query and in the count', async () => {
        mockJoinQuery([], 0);

        await findPetLeaderboard({ chain: 'evm', page: 0, pageSize: 20 });

        const battled = 'COALESCE(p.win_count, r.win_count) + COALESCE(p.loss_count, r.loss_count) > 0';
        expect(sqlOfCall(0)).toContain(battled);
        // The count must apply the same filter, or `total` would page past the last row.
        expect(sqlOfCall(1)).toContain(battled);
    });

    it('falls back to chain state for a chain family this deployment does not serve', async () => {
        servedChainIdForFamily.mockReturnValue(null);
        vi.mocked(prisma.petRoster.findMany).mockResolvedValue([rankedRow] as never);
        vi.mocked(prisma.petRoster.count).mockResolvedValue(1 as never);

        const result = await findPetLeaderboard({ chain: 'solana', page: 0, pageSize: 20 });

        expect(prisma.$queryRaw).not.toHaveBeenCalled();
        expect(result.entries[0].rank).toBe(1);

        const args = vi.mocked(prisma.petRoster.findMany).mock.calls[0][0];
        expect(args?.orderBy).toEqual([
            { winCount: 'desc' },
            { lossCount: 'asc' },
            { level: 'desc' },
            { petId: 'asc' },
        ]);
        expect(args?.where?.OR).toEqual([{ winCount: { gt: 0 } }, { lossCount: { gt: 0 } }]);
    });
});
