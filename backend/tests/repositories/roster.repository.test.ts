import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@config/prisma', () => ({
    prisma: {
        petRoster: {
            findMany: vi.fn(),
            count: vi.fn(),
            findUnique: vi.fn(),
        },
        $queryRaw: vi.fn(),
    },
}));
vi.mock('../../src/grpc/rosterReads', () => ({
    tryGrpcGetPetState: vi.fn().mockResolvedValue(null),
}));

const servedChainIdForFamily = vi.fn(() => 'eip155:31337' as string | null);
vi.mock('../../src/repositories/battleProgress.overlay', () => ({
    servedChainIdForFamily: (chain: string) => servedChainIdForFamily(chain),
}));

import { findReadyOpponents, getPetById } from '../../src/repositories/roster.repository';
import { prisma } from '@config/prisma';

const rosterRow = {
    chain: 'evm',
    petId: '1',
    owner: '0xowner',
    name: 'Rex',
    level: 5,
    rarity: 1,
    dna: '0xdna',
    winCount: 3,
    lossCount: 1,
    readyAt: 0n,
    xp: 100,
    generation: 1,
    parent1Id: '0',
    parent2Id: '0',
    breedCount: 0,
    speciesId: 1,
    spouseId: '0',
    breedReadyAt: 0n,
    trainReadyAt: 0n,
    asset: '',
};

/** `$queryRaw` is called twice per lookup: the page, then its count. */
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

describe('findReadyOpponents', () => {
    it('returns the joined rows and their count', async () => {
        mockJoinQuery([rosterRow], 1);

        const result = await findReadyOpponents({
            chain: 'evm',
            excludeOwner: '0xother',
            minLevel: 0,
            page: 0,
            pageSize: 20,
        });

        expect(result.total).toBe(1);
        expect(result.rows[0].petId).toBe('1');
        expect(result.rows[0].readyAt).toBe(0n);
    });

    it('bands and orders on the merged level, taking the greater of the two sources', async () => {
        // The whole point of doing this in SQL: a pet that climbed through backend battles
        // must be banded at the level it actually reached — and one whose owner paid for
        // on-chain train/level-up after its first battle must not be banded at the stale
        // row level either. GREATEST, mirroring the ready_at merge, loses neither.
        mockJoinQuery([], 0);

        await findReadyOpponents({ chain: 'evm', excludeOwner: '0x', minLevel: 3, page: 0, pageSize: 10 });

        const sql = sqlOfCall(0);
        expect(sql).toContain('GREATEST(r.level, COALESCE(p.level, 0)) >=');
        expect(sql).toContain('ORDER BY GREATEST(r.level, COALESCE(p.level, 0)) ASC');
        expect(sql).not.toMatch(/WHERE[\s\S]*COALESCE\(p\.level, r\.level\) >=/);
    });

    it('filters on the later of the two cooldowns', async () => {
        // Breeding writes the on-chain lockout, battles write the backend one; a pet held
        // by either is not available.
        mockJoinQuery([], 0);

        await findReadyOpponents({ chain: 'evm', excludeOwner: '0x', minLevel: 0, page: 0, pageSize: 10 });

        expect(sqlOfCall(0)).toContain('GREATEST(r.ready_at, COALESCE(p.ready_at, 0::bigint)) <=');
    });

    it('counts with the same filter it pages with', async () => {
        // A count over a different predicate would page past the end of the real result.
        mockJoinQuery([], 0);

        await findReadyOpponents({ chain: 'evm', excludeOwner: '0x', minLevel: 3, page: 0, pageSize: 10 });

        const page = sqlOfCall(0);
        const count = sqlOfCall(1);
        for (const clause of [
            'GREATEST(r.level, COALESCE(p.level, 0)) >=',
            'GREATEST(r.ready_at, COALESCE(p.ready_at, 0::bigint)) <=',
            'r.owner <>',
        ]) {
            expect(page).toContain(clause);
            expect(count).toContain(clause);
        }
    });

    it('falls back to the plain roster query for an unserved chain family', async () => {
        // Nothing to join: no progression exists for a chain this deployment does not run
        // battles for, so the frozen columns are the whole truth.
        servedChainIdForFamily.mockReturnValue(null);
        vi.mocked(prisma.petRoster.findMany).mockResolvedValue([rosterRow] as never);
        vi.mocked(prisma.petRoster.count).mockResolvedValue(1);

        const result = await findReadyOpponents({
            chain: 'solana',
            excludeOwner: '0x',
            minLevel: 3,
            page: 0,
            pageSize: 10,
        });

        expect(prisma.$queryRaw).not.toHaveBeenCalled();
        expect(result.total).toBe(1);
        const where = vi.mocked(prisma.petRoster.findMany).mock.calls[0][0].where;
        expect(where.level).toEqual({ gte: 3 });
    });

    it('omits the level filter entirely when minLevel is 0 on the fallback path', async () => {
        servedChainIdForFamily.mockReturnValue(null);
        vi.mocked(prisma.petRoster.findMany).mockResolvedValue([]);
        vi.mocked(prisma.petRoster.count).mockResolvedValue(0);

        await findReadyOpponents({ chain: 'solana', excludeOwner: '0x', minLevel: 0, page: 0, pageSize: 10 });

        const where = vi.mocked(prisma.petRoster.findMany).mock.calls[0][0].where;
        expect(where).not.toHaveProperty('level');
    });
});

describe('getPetById', () => {
    it('returns mapped pet when found via Prisma', async () => {
        vi.mocked(prisma.petRoster.findUnique).mockResolvedValue(rosterRow as never);
        const result = await getPetById('evm', '1');
        expect(result?.petId).toBe('1');
        expect(result?.readyAt).toBe(0n);
    });

    it('returns null when no pet is found', async () => {
        vi.mocked(prisma.petRoster.findUnique).mockResolvedValue(null);
        expect(await getPetById('evm', '99')).toBeNull();
    });

    it('returns chain state unmerged, for callers that need it that way', async () => {
        // snapshot.builder.ts seeds a pet's first progress row from this level; merging
        // here would feed backend progression back into its own source.
        vi.mocked(prisma.petRoster.findUnique).mockResolvedValue(rosterRow as never);

        const result = await getPetById('evm', '1');

        expect(result?.level).toBe(5);
        expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
});
