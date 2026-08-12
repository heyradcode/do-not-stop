import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/prisma', () => ({
    prisma: { rewardSeason: { findUnique: vi.fn(), findMany: vi.fn() } },
}));

vi.mock('@features/battle/rewards/season.service', () => ({
    getClaimProof: vi.fn(),
}));

import { prisma } from '@config/prisma';
import { getSeason, getSeasonClaim, listSeasons } from '@features/battle/rewards/season.controller';
import { getClaimProof } from '@features/battle/rewards/season.service';

/**
 * The public reads for a reward season.
 *
 * What matters here is what the response *contains*: this endpoint is the reproducibility
 * contract. A field it omits is one nobody outside can use to check our arithmetic, and the
 * omission looks like nothing at all.
 */

function res() {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    return { status, json, get body() { return json.mock.calls[0]?.[0]; } } as never as {
        status: ReturnType<typeof vi.fn>;
        json: ReturnType<typeof vi.fn>;
        body: Record<string, unknown>;
    };
}

const EVM_SEASON = {
    seasonId: 1,
    chainId: 'eip155:84532',
    deploymentId: 'base-sepolia-live',
    firstSequence: 1n,
    lastSequence: 100n,
    distributor: '0x1111111111111111111111111111111111111111',
    evmChainId: 84532,
    chainRef: null,
    token: '0x2222222222222222222222222222222222222222',
    merkleRoot: `0x${'11'.repeat(32)}`,
    totalAmount: '125',
    params: { perWin: '100', perLoss: '25', perBattleCap: '1000' },
    openedTxHash: null,
    openedAt: null,
};

const SOLANA_SEASON = {
    ...EVM_SEASON,
    seasonId: 2,
    chainId: 'solana:devnet',
    deploymentId: 'devnet-live',
    distributor: 'RewaRDsFhqhVBHrHFHKcnbXPPHUvNSVKWnxNBXjHkVh',
    evmChainId: null,
    chainRef: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
    token: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe('season metadata', () => {
    it('serves the sequence range as strings, since it is a bigint on the wire', async () => {
        vi.mocked(prisma.rewardSeason.findUnique).mockResolvedValue(EVM_SEASON as never);
        const response = res();

        await getSeason({ params: { seasonId: '1' } } as never, response as never);

        expect(response.status).toHaveBeenCalledWith(200);
        expect(response.body.firstSequence).toBe('1');
        expect(response.body.lastSequence).toBe('100');
    });

    it('serves an evm season with its numeric chain id', async () => {
        vi.mocked(prisma.rewardSeason.findUnique).mockResolvedValue(EVM_SEASON as never);
        const response = res();

        await getSeason({ params: { seasonId: '1' } } as never, response as never);

        expect(response.body.evmChainId).toBe(84532);
        expect(response.body.chainRef).toBeNull();
    });

    // The gap this test exists for. A leaf binds the chain, so without chainRef nobody can
    // rebuild a Solana season's tree, and the season's arithmetic becomes uncheckable by
    // anyone outside. An omitted field looks like nothing at all.
    it('serves a solana season with its cluster reference', async () => {
        vi.mocked(prisma.rewardSeason.findUnique).mockResolvedValue(SOLANA_SEASON as never);
        const response = res();

        await getSeason({ params: { seasonId: '2' } } as never, response as never);

        expect(response.body.chainRef).toBe('EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
        expect(response.body.evmChainId).toBeNull();
    });

    it('serves the distributor and token unmangled, so base58 survives', async () => {
        vi.mocked(prisma.rewardSeason.findUnique).mockResolvedValue(SOLANA_SEASON as never);
        const response = res();

        await getSeason({ params: { seasonId: '2' } } as never, response as never);

        expect(response.body.distributor).toBe('RewaRDsFhqhVBHrHFHKcnbXPPHUvNSVKWnxNBXjHkVh');
        expect(response.body.token).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    });

    it('404s an unknown season', async () => {
        vi.mocked(prisma.rewardSeason.findUnique).mockResolvedValue(null);
        const response = res();

        await getSeason({ params: { seasonId: '9' } } as never, response as never);

        expect(response.status).toHaveBeenCalledWith(404);
    });
});

describe('claim proofs', () => {
    it('serves a proof for an entitled wallet', async () => {
        vi.mocked(getClaimProof).mockResolvedValue({ seasonId: 1, wallet: 'w', amount: '5' } as never);
        const response = res();

        await getSeasonClaim({ params: { seasonId: '1', wallet: 'w' } } as never, response as never);

        expect(response.status).toHaveBeenCalledWith(200);
    });

    // One status for two cases on purpose: distinguishing them would leak which wallets
    // participated to anyone enumerating.
    it('gives the same 404 for an unknown season and an unentitled wallet', async () => {
        vi.mocked(getClaimProof).mockResolvedValue(null);
        const response = res();

        await getSeasonClaim({ params: { seasonId: '1', wallet: 'w' } } as never, response as never);

        expect(response.status).toHaveBeenCalledWith(404);
        expect(response.body.error).toBe('no-entitlement');
    });

    it.each(['-1', 'abc', '1.5'])('rejects %s as a season id', async (seasonId) => {
        const response = res();

        await getSeasonClaim({ params: { seasonId, wallet: 'w' } } as never, response as never);

        expect(response.status).toHaveBeenCalledWith(422);
    });
});

describe('listing seasons', () => {
    // Without this a season is reachable only by someone told its number out of band:
    // getSeason needs an id the caller already has, and nothing else publishes one.
    it('serves every season, newest first', async () => {
        vi.mocked(prisma.rewardSeason.findMany).mockResolvedValue([
            { seasonId: 2, chainId: 'solana:devnet' },
            { seasonId: 1, chainId: 'eip155:84532' },
        ] as never);
        const response = res();

        await listSeasons({} as never, response as never);

        expect(response.status).toHaveBeenCalledWith(200);
        expect((response.body.seasons as { seasonId: number }[]).map((s) => s.seasonId)).toEqual([2, 1]);
        const query = vi.mocked(prisma.rewardSeason.findMany).mock.calls[0]![0] as { orderBy: unknown };
        expect(query.orderBy).toEqual({ seasonId: 'desc' });
    });

    it('is an empty list, not a 404, before any season exists', async () => {
        vi.mocked(prisma.rewardSeason.findMany).mockResolvedValue([] as never);
        const response = res();

        await listSeasons({} as never, response as never);

        expect(response.status).toHaveBeenCalledWith(200);
        expect(response.body.seasons).toEqual([]);
    });

    // The root and the sequence range belong to getSeason, where the reproducibility
    // contract lives; two copies would give a client two answers to check against.
    it('omits the root and the sequence range', async () => {
        vi.mocked(prisma.rewardSeason.findMany).mockResolvedValue([] as never);
        const response = res();

        await listSeasons({} as never, response as never);

        const query = vi.mocked(prisma.rewardSeason.findMany).mock.calls[0]![0] as { select: Record<string, boolean> };
        expect(query.select.merkleRoot).toBeUndefined();
        expect(query.select.firstSequence).toBeUndefined();
    });
});
