import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@config/prisma', () => ({
    prisma: {
        petRoster: {
            findMany: vi.fn(),
            count: vi.fn(),
            findUnique: vi.fn(),
        },
        $queryRaw: vi.fn(),
        defenseAuthorization: { count: vi.fn() },
    },
}));
vi.mock('../../src/grpc/rosterReads', () => ({
    tryGrpcGetPetState: vi.fn().mockResolvedValue(null),
}));

const servedChainIdForFamily = vi.fn(() => 'eip155:31337' as string | null);
vi.mock('../../src/repositories/battleProgress.overlay', () => ({
    servedChainIdForFamily: (chain: string) => servedChainIdForFamily(chain),
}));

/**
 * A ruleset with a **non-empty** item catalog, which is the whole point of the stub.
 *
 * `servedRuleset()` joins the live catalog onto `SOURCE_DEFAULT_RULESET`, so the two are
 * equal only while no item is seeded. Stubbing it to the bare constant here would make the
 * consent filter's hash match by accident and hide the exact bug these cases now pin.
 */
vi.mock('../../src/features/battle/ledger/ruleset.builder', async () => {
    const { SOURCE_DEFAULT_RULESET } = await vi.importActual<typeof import('@cryptopets/protocol')>(
        '@cryptopets/protocol',
    );
    return {
        servedRuleset: vi.fn(async () => ({
            ...SOURCE_DEFAULT_RULESET,
            itemCatalog: [{ itemType: 3n, slot: 0, hp: 0, atk: 22, def: 0, int: 0, mdef: 0 }],
        })),
    };
});

import { hashRuleset, SOURCE_DEFAULT_RULESET } from '@cryptopets/protocol';

import { findReadyOpponents, getPetById } from '../../src/repositories/roster.repository';
import { servedRuleset } from '../../src/features/battle/ledger/ruleset.builder';
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

/**
 * `$queryRaw` is called twice per lookup — the page, then its count — and a third time
 * only when the count is zero, to work out which filter emptied it.
 *
 * The third response is queued unconditionally because an unused `mockResolvedValueOnce`
 * is harmless, while a missing one throws inside the diagnostic rather than in the case
 * under test, which reads as an unrelated failure.
 */
function mockJoinQuery(rows: unknown[], total: number) {
    vi.mocked(prisma.$queryRaw)
        .mockResolvedValueOnce(rows as never)
        .mockResolvedValueOnce([{ total: BigInt(total) }] as never)
        .mockResolvedValueOnce([{ indexed: 0n, notMine: 0n, offCooldown: 0n, inBand: 0n }] as never);
}

/** The SQL text of the nth `$queryRaw` call, whitespace-collapsed for matching. */
function sqlOfCall(index: number): string {
    const [template] = vi.mocked(prisma.$queryRaw).mock.calls[index] as unknown as [string[]];
    return template.join(' ? ').replace(/\s+/g, ' ');
}

/**
 * The SQL of any `Prisma.Sql` fragments interpolated into the nth call.
 *
 * `sqlOfCall` only sees the literal chunks; a nested fragment arrives as a value, so
 * the consent clause is invisible to it. `$queryRaw` is mocked, so the nesting is
 * never flattened and the fragments are still separate objects here.
 */
function fragmentsOfCall(index: number): string {
    const [, ...values] = vi.mocked(prisma.$queryRaw).mock.calls[index] as unknown as [string[], ...unknown[]];
    return values
        .filter((value): value is { sql: string } => typeof (value as { sql?: unknown })?.sql === 'string')
        .map((fragment) => fragment.sql)
        .join(' ')
        .replace(/\s+/g, ' ');
}

/**
 * Every bound value in the nth call, flattened through nested `Prisma.Sql` fragments.
 *
 * The consent clause is a fragment interpolated into the outer query, and the ruleset hash
 * is bound *inside* it, so it never appears among the outer call's own values. Flattening
 * is what makes it assertable at all.
 */
function valuesOfCall(index: number): unknown[] {
    const [, ...values] = vi.mocked(prisma.$queryRaw).mock.calls[index] as unknown as [string[], ...unknown[]];
    const flatten = (input: unknown[]): unknown[] =>
        input.flatMap((value) => {
            const fragment = value as { sql?: unknown; values?: unknown[] };
            return typeof fragment?.sql === 'string' && Array.isArray(fragment.values)
                ? flatten(fragment.values)
                : [value];
        });
    return flatten(values);
}

beforeEach(() => {
    vi.clearAllMocks();
    // `clearAllMocks` drops recorded calls but not queued `mockResolvedValueOnce`
    // implementations. A case that queues three responses and consumes two leaves one
    // behind, which the next case then consumes as its *first* answer — so a test fails
    // reporting the previous test's data and nothing in either one looks wrong.
    vi.mocked(prisma.$queryRaw).mockReset();
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

    it('drops pets whose owner granted no live defence consent', async () => {
        // Without this the list offers opponents `acceptBattle` always refuses with 403
        // no-authorization — and it refuses after the attacker has signed, so the player
        // pays a wallet prompt to find out the fight was never possible.
        mockJoinQuery([], 0);

        await findReadyOpponents({ chain: 'evm', excludeOwner: '0x', minLevel: 0, page: 0, pageSize: 10 });

        const consent = fragmentsOfCall(0);
        expect(consent).toContain('EXISTS');
        expect(consent).toContain('defense_authorization');
        expect(consent).toContain('a.revoked_at IS NULL');
        expect(consent).toContain('a.all_pets OR a.pet_ids @>');
    });

    /**
     * Matches on the hash defenders actually signed, which is the *served* ruleset.
     *
     * This filtered on `hashRuleset(SOURCE_DEFAULT_RULESET)` while clients sign what
     * `GET /api/battle/config` serves, which is `servedRuleset()`. Equal only while the item
     * catalog is empty; seed one equipment item and the predicate matches no authorization
     * ever written, so matchmaking returns nothing on a deployment full of consenting pets.
     *
     * The stubbed ruleset carries an item, so the two hashes genuinely differ here and the
     * assertion fails against the old code instead of passing by coincidence.
     */
    it('matches consent on the served ruleset hash, not the source default', async () => {
        mockJoinQuery([], 0);

        await findReadyOpponents({ chain: 'evm', excludeOwner: '0x', minLevel: 0, page: 0, pageSize: 10 });

        const served = await vi.mocked(servedRuleset)();
        const values = valuesOfCall(0);
        expect(values).toContain(hashRuleset(served));
        expect(values).not.toContain(hashRuleset(SOURCE_DEFAULT_RULESET));
    });

    /**
     * Which filter emptied the list.
     *
     * Four situations render as the same blank picker and only some are the player's to
     * act on. Working out which one cost several rounds of guessing by hand, which is the
     * argument for the server answering it.
     */
    describe('when the list comes back empty', () => {
        /** page, count, then the diagnostic pass. */
        function mockEmptyWithCounts(counts: Record<string, number>) {
            vi.mocked(prisma.$queryRaw)
                .mockResolvedValueOnce([] as never)
                .mockResolvedValueOnce([{ total: 0n }] as never)
                .mockResolvedValueOnce([
                    {
                        indexed: BigInt(counts.indexed ?? 0),
                        notMine: BigInt(counts.notMine ?? 0),
                        offCooldown: BigInt(counts.offCooldown ?? 0),
                        inBand: BigInt(counts.inBand ?? 0),
                    },
                ] as never);
        }

        const call = () =>
            findReadyOpponents({ chain: 'evm', excludeOwner: '0xme', minLevel: 0, page: 0, pageSize: 10 });

        it('blames an unindexed roster, which is a server problem and not the player’s', async () => {
            mockEmptyWithCounts({ indexed: 0 });
            expect((await call()).emptyReason).toBe('roster-empty');
        });

        it('reports that every pet is the caller’s own', async () => {
            mockEmptyWithCounts({ indexed: 5, notMine: 0 });
            expect((await call()).emptyReason).toBe('all-yours');
        });

        it('reports cooldown when others exist but none are ready', async () => {
            mockEmptyWithCounts({ indexed: 5, notMine: 3, offCooldown: 0 });
            expect((await call()).emptyReason).toBe('all-on-cooldown');
        });

        it('reports the level band when it is what excluded everyone', async () => {
            mockEmptyWithCounts({ indexed: 5, notMine: 3, offCooldown: 3, inBand: 0 });
            expect((await call()).emptyReason).toBe('below-min-level');
        });

        // Consent is the only predicate left once the others are survived, and the two
        // ways it fails send the player somewhere different.
        it('reports no consent when nobody has granted any', async () => {
            mockEmptyWithCounts({ indexed: 5, notMine: 3, offCooldown: 3, inBand: 3 });
            vi.mocked(prisma.defenseAuthorization.count).mockResolvedValueOnce(0);

            expect((await call()).emptyReason).toBe('no-consent');
        });

        it('reports stale consent when grants exist but none match the served ruleset', async () => {
            // The distinction that matters: "turn it on" and "turn it on again" are
            // different instructions, and only one of them is right for someone who
            // already did.
            mockEmptyWithCounts({ indexed: 5, notMine: 3, offCooldown: 3, inBand: 3 });
            vi.mocked(prisma.defenseAuthorization.count)
                .mockResolvedValueOnce(2)
                .mockResolvedValueOnce(0);

            expect((await call()).emptyReason).toBe('consent-stale');
        });

        it('costs nothing when the list is not empty', async () => {
            mockJoinQuery([rosterRow], 1);

            const result = await call();

            expect(result.emptyReason).toBeUndefined();
            // Two queries, not three: the diagnostic pass never runs on the happy path.
            expect(vi.mocked(prisma.$queryRaw)).toHaveBeenCalledTimes(2);
        });
    });

    it('uses the same ruleset hash for the count as for the page', async () => {
        // The count runs its own copy of the predicate, so a hash fixed in one and not the
        // other would page correctly and total wrongly.
        mockJoinQuery([], 0);

        await findReadyOpponents({ chain: 'evm', excludeOwner: '0x', minLevel: 0, page: 0, pageSize: 10 });

        const served = hashRuleset(await vi.mocked(servedRuleset)());
        expect(valuesOfCall(0)).toContain(served);
        expect(valuesOfCall(1)).toContain(served);
    });

    it('leaves the level band and daily cap to accept time', async () => {
        // `authorizationCovers` stays the only thing that authorizes a battle. Both of
        // these depend on the attacker, who is not known when the list is built, so
        // reimplementing them here could only diverge from the protocol rule.
        mockJoinQuery([], 0);

        await findReadyOpponents({ chain: 'evm', excludeOwner: '0x', minLevel: 0, page: 0, pageSize: 10 });

        const consent = fragmentsOfCall(0);
        expect(consent).not.toContain('min_level');
        expect(consent).not.toContain('max_level');
        expect(consent).not.toContain('max_battles_per_day');
    });

    it('folds owner case on EVM only', async () => {
        // normalizeAccount lowercases EVM addresses and leaves base58 alone; folding a
        // base58 pubkey could match a different owner entirely.
        mockJoinQuery([], 0);
        await findReadyOpponents({ chain: 'evm', excludeOwner: '0x', minLevel: 0, page: 0, pageSize: 10 });
        expect(fragmentsOfCall(0)).toContain('LOWER(r.owner) = a.defender_owner');

        vi.clearAllMocks();
        servedChainIdForFamily.mockReturnValue('solana:devnet');
        mockJoinQuery([], 0);
        await findReadyOpponents({ chain: 'solana', excludeOwner: 'Bhp', minLevel: 0, page: 0, pageSize: 10 });
        const solana = fragmentsOfCall(0);
        expect(solana).toContain('r.owner = a.defender_owner');
        expect(solana).not.toContain('LOWER(');
    });

    it('counts consent with the same clause it pages with', async () => {
        // A count that ignored consent would page past the end of the real result.
        mockJoinQuery([], 0);

        await findReadyOpponents({ chain: 'evm', excludeOwner: '0x', minLevel: 0, page: 0, pageSize: 10 });

        expect(fragmentsOfCall(1)).toContain('defense_authorization');
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
