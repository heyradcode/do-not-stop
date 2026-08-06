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

function callOf(index: number): [string[], ...unknown[]] {
    return vi.mocked(prisma.$queryRaw).mock.calls[index] as unknown as [string[], ...unknown[]];
}

/**
 * The full SQL of the nth `$queryRaw` call: literal chunks with any interpolated
 * `Prisma.Sql` fragment spliced back in.
 *
 * The queries are assembled from shared fragments (the merge, the filter, the ordering),
 * and `$queryRaw` is mocked so nothing ever flattens them — a helper that read only the
 * literal chunks would see none of the logic under test.
 */
function sqlOfCall(index: number): string {
    const [template, ...values] = callOf(index);
    return template
        .map((chunk, i) => {
            const value = values[i] as { sql?: unknown } | undefined;
            return chunk + (typeof value?.sql === 'string' ? value.sql : i < values.length ? ' ? ' : '');
        })
        .join('')
        .replace(/\s+/g, ' ');
}

/**
 * Every bound parameter of the nth call, including those carried by interpolated
 * fragments — the join's `chain_id` is one of those, so a helper that only looked at the
 * outer values would miss it.
 */
function paramsOfCall(index: number): unknown[] {
    const [, ...values] = callOf(index);
    return values.flatMap((value) => {
        const fragment = value as { sql?: unknown; values?: unknown[] };
        return typeof fragment?.sql === 'string' ? (fragment.values ?? []) : [value];
    });
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

    // A chain family this deployment does not serve needs no second query: `chain_id = NULL`
    // never matches, so the join contributes nothing and every COALESCE falls back to the
    // roster column — which is the chain-state-only ranking, exactly.
    it('joins on a null chain id for an unserved chain family, falling back to roster values', async () => {
        servedChainIdForFamily.mockReturnValue(null);
        mockJoinQuery([rankedRow], 1);

        const result = await findPetLeaderboard({ chain: 'solana', page: 0, pageSize: 20 });

        expect(result.entries[0].rank).toBe(1);
        expect(sqlOfCall(0)).toContain('LEFT JOIN pet_battle_progress p');
        expect(paramsOfCall(0)).toContain(null);
        // No separate roster-only code path exists any more.
        expect(prisma.petRoster.findMany).not.toHaveBeenCalled();
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

        expect(sqlOfCall(0)).toContain('LOWER(r.owner)');
    });

    it('leaves Solana pubkeys unfolded, since base58 is case-significant', async () => {
        // Folding here would merge two distinct pubkeys into one player.
        mockJoinQuery([], 0);

        await findPlayerLeaderboard({ chain: 'solana', page: 0, pageSize: 20 });

        const sql = sqlOfCall(0);
        expect(sql).toContain('r.owner');
        expect(sql).not.toContain('LOWER(');
    });

    it('sums the merged record and counts owners, not pets', async () => {
        mockJoinQuery([], 0);

        await findPlayerLeaderboard({ chain: 'evm', page: 0, pageSize: 20 });

        const sql = sqlOfCall(0);
        expect(sql).toContain('SUM(COALESCE(p.win_count, r.win_count))::int');
        expect(sql).toContain('SUM(COALESCE(p.loss_count, r.loss_count))::int');
        expect(sql).toContain('ORDER BY SUM(COALESCE(p.win_count, r.win_count)) DESC');
        // The total counts grouped owners: COUNT(*) over the ungrouped join would count
        // pets, and page the client past the last owner.
        expect(sqlOfCall(1)).toContain('SELECT COUNT(*) AS total FROM (');
        expect(sqlOfCall(1)).toContain('GROUP BY');
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

    // The board and the rank are ordered by one shared fragment. If they ever diverged, a
    // player's stated rank would stop matching where they actually appear.
    it('ranks with ROW_NUMBER over the same ordering the paged board uses', async () => {
        vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([] as never);
        await findPlayerRank('evm', '0xowner');
        const rankSql = sqlOfCall(0);

        vi.mocked(prisma.$queryRaw).mockClear();
        mockJoinQuery([], 0);
        await findPlayerLeaderboard({ chain: 'evm', page: 0, pageSize: 20 });
        const boardSql = sqlOfCall(0);

        const ordering = 'SUM(COALESCE(p.win_count, r.win_count)) DESC, SUM(COALESCE(p.loss_count, r.loss_count)) ASC, LOWER(r.owner) ASC';
        expect(rankSql).toContain(`ROW_NUMBER() OVER (ORDER BY ${ordering})`);
        expect(boardSql).toContain(`ORDER BY ${ordering}`);
    });

    it('ranks on frozen counters for a chain family this deployment does not serve', async () => {
        servedChainIdForFamily.mockReturnValue(null);
        vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([] as never);

        await findPlayerRank('solana', 'SoLpubkey');

        const sql = sqlOfCall(0);
        expect(sql).toContain('ROW_NUMBER() OVER (');
        expect(paramsOfCall(0)).toContain(null);
        // base58 stays unfolded here too, for the reason the board folds only EVM.
        expect(sql).not.toContain('LOWER(');
    });
});
