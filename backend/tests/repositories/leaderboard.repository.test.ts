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

import {
    findPetLeaderboard,
    findPlayerLeaderboard,
    findPlayerRank,
} from '../../src/repositories/leaderboard.repository';
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

/**
 * The SQL of any `Prisma.Sql` fragments interpolated into the nth call.
 *
 * `sqlOfCall` only sees the literal chunks, so the owner key — a nested fragment — is
 * invisible to it. `$queryRaw` is mocked, so the nesting is never flattened.
 */
function fragmentsOfCall(index: number): string {
    const [, ...values] = vi.mocked(prisma.$queryRaw).mock.calls[index] as unknown as [string[], ...unknown[]];
    return values
        .filter((value): value is { sql: string } => typeof (value as { sql?: unknown })?.sql === 'string')
        .map((fragment) => fragment.sql)
        .join(' ')
        .replace(/\s+/g, ' ');
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

describe('findPlayerLeaderboard', () => {
    const playerRow = { owner: '0xowner', winCount: 20, lossCount: 4, petCount: 3 };

    it('returns the ranked owners and their total', async () => {
        mockJoinQuery([playerRow], 1);

        const result = await findPlayerLeaderboard({ chain: 'evm', page: 0, pageSize: 20 });

        expect(result.total).toBe(1);
        expect(result.entries[0]).toMatchObject({ owner: '0xowner', rank: 1, petCount: 3 });
    });

    it('numbers ranks absolutely, continuing across pages', async () => {
        mockJoinQuery([playerRow, { ...playerRow, owner: '0xother' }], 30);

        const result = await findPlayerLeaderboard({ chain: 'evm', page: 1, pageSize: 20 });

        expect(result.entries.map((entry) => entry.rank)).toEqual([21, 22]);
    });

    it('folds EVM owners to one group so a wallet is not listed twice', async () => {
        // indexer-go is not guaranteed to write the roster in one case, and an unfolded
        // group would split a single wallet's record across two rows.
        mockJoinQuery([], 0);

        await findPlayerLeaderboard({ chain: 'evm', page: 0, pageSize: 20 });

        expect(fragmentsOfCall(0)).toContain('LOWER(r.owner)');
    });

    it('leaves Solana pubkeys unfolded, since base58 is case-significant', async () => {
        // Folding here would merge two distinct pubkeys into one player.
        mockJoinQuery([], 0);

        await findPlayerLeaderboard({ chain: 'solana', page: 0, pageSize: 20 });

        const fragments = fragmentsOfCall(0);
        expect(fragments).toContain('r.owner');
        expect(fragments).not.toContain('LOWER(');
    });

    it('sums the merged record and counts owners, not pets', async () => {
        mockJoinQuery([], 0);

        await findPlayerLeaderboard({ chain: 'evm', page: 0, pageSize: 20 });

        const sql = sqlOfCall(0);
        expect(sql).toContain('SUM(COALESCE(p.win_count, r.win_count))::int');
        expect(sql).toContain('SUM(COALESCE(p.loss_count, r.loss_count))::int');
        expect(sql).toContain('ORDER BY "winCount" DESC, "lossCount" ASC');
        // The total counts grouped owners: COUNT(*) over the ungrouped join would count
        // pets, and page the client past the last owner.
        expect(sqlOfCall(1)).toContain('SELECT COUNT(*) AS total FROM (');
        expect(sqlOfCall(1)).toContain('GROUP BY');
    });

    it('sums frozen roster counters for a chain family this deployment does not serve', async () => {
        servedChainIdForFamily.mockReturnValue(null);
        mockJoinQuery([playerRow], 1);

        const result = await findPlayerLeaderboard({ chain: 'solana', page: 0, pageSize: 20 });

        expect(result.entries[0].rank).toBe(1);
        const sql = sqlOfCall(0);
        expect(sql).toContain('SUM(r.win_count)::int');
        expect(sql).not.toContain('pet_battle_progress');
        expect(sqlOfCall(1)).toContain('COUNT(DISTINCT');
    });
});

describe('findPlayerRank', () => {
    const rankedRowForOwner = { rank: 4, owner: '0xowner', winCount: 8, lossCount: 4, petCount: 3 };

    it('returns the caller row with its rank', async () => {
        vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([rankedRowForOwner] as never);

        expect(await findPlayerRank('evm', '0xowner')).toEqual(rankedRowForOwner);
    });

    it('returns null for a player holding no pet that has fought', async () => {
        // Unranked is a real answer. A zeroed row could not be told apart from a player
        // who has fought and lost everything.
        vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([] as never);

        expect(await findPlayerRank('evm', '0xowner')).toBeNull();
    });

    it('does not query at all for an unauthenticated caller', async () => {
        expect(await findPlayerRank('evm', '')).toBeNull();
        expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('ranks with ROW_NUMBER over the ordering the paged board uses', async () => {
        // The paged board numbers rows `offset + index + 1`; this has to be the same
        // function, or a player's stated rank would not match where they appear.
        vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([] as never);

        await findPlayerRank('evm', '0xowner');

        const fragments = fragmentsOfCall(0);
        expect(fragments).toContain('ROW_NUMBER() OVER (');
        expect(fragments).toContain('SUM(COALESCE(p.win_count, r.win_count)) DESC');
        expect(fragments).toContain('SUM(COALESCE(p.loss_count, r.loss_count)) ASC');
        expect(fragments).toContain('LOWER(r.owner)');
    });

    it('ranks on frozen counters for a chain family this deployment does not serve', async () => {
        servedChainIdForFamily.mockReturnValue(null);
        vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([] as never);

        await findPlayerRank('solana', 'SoLpubkey');

        const fragments = fragmentsOfCall(0);
        expect(fragments).toContain('SUM(r.win_count) DESC');
        expect(fragments).not.toContain('pet_battle_progress');
        // base58 stays unfolded here too, for the reason the board folds only EVM.
        expect(fragments).not.toContain('LOWER(');
    });
});
