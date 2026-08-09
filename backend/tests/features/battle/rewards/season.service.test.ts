import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildMerkleTree, rewardMerkleLeaf, verifyMerkleProof } from '@cryptopets/protocol';

vi.mock('@config/prisma', () => {
    const tx = {
        rewardSeason: { create: vi.fn() },
        rewardEntitlement: { createMany: vi.fn() },
    };
    return {
        prisma: {
            rewardSeason: { findUnique: vi.fn() },
            battleReceipt: { findMany: vi.fn() },
            $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
            __tx: tx,
        },
    };
});

import { prisma } from '@config/prisma';
import { buildSeason, getClaimProof, type SeasonInputs } from '@features/battle/rewards';

const ALICE = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const BOB = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const CAROL = '0xcccccccccccccccccccccccccccccccccccccccc';
const DISTRIBUTOR = '0x1111111111111111111111111111111111111111';
const TOKEN = '0x2222222222222222222222222222222222222222';
const tx = (prisma as unknown as { __tx: Record<string, Record<string, ReturnType<typeof vi.fn>>> }).__tx;

const INPUTS: SeasonInputs = {
    seasonId: 1,
    chainId: 'eip155:84532',
    deploymentId: 'base-sepolia-live',
    firstSequence: 1n,
    lastSequence: 100n,
    distributor: DISTRIBUTOR,
    evmChainId: 84532,
    token: TOKEN,
    rates: { perWin: 100n, perLoss: 25n, perBattleCap: 1000n },
};

function receiptRow(attackerOwner: string, defenderOwner: string, attackerWon: boolean) {
    return { payload: { snapshot: { attacker: { owner: attackerOwner }, defender: { owner: defenderOwner } }, result: { attackerWon } } };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.rewardSeason.findUnique).mockResolvedValue(null);
    tx.rewardSeason.create.mockResolvedValue({});
    tx.rewardEntitlement.createMany.mockResolvedValue({ count: 0 });
});

describe('building a season', () => {
    it('computes entitlements and a root over the anchored battles', async () => {
        vi.mocked(prisma.battleReceipt.findMany).mockResolvedValue([
            receiptRow(ALICE, BOB, true),
            receiptRow(BOB, CAROL, true),
        ] as never);

        const season = await buildSeason(INPUTS);

        expect(season.totalAmount).toBe(250n);
        expect(season.entitlements.map((e) => e.wallet)).toEqual([ALICE, BOB, CAROL]);
        expect(season.merkleRoot).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('only counts receipts whose batch is anchored', async () => {
        // An unanchored receipt is public but its root is not yet immutable, so rewarding
        // it means paying against a history that could still be reorganised.
        vi.mocked(prisma.battleReceipt.findMany).mockResolvedValue([receiptRow(ALICE, BOB, true)] as never);
        await buildSeason(INPUTS);

        const query = vi.mocked(prisma.battleReceipt.findMany).mock.calls[0]![0] as {
            where: { batch: { anchoredAt: { not: null } }; sequence: unknown };
        };
        expect(query.where.batch.anchoredAt).toEqual({ not: null });
        expect(query.where.sequence).toEqual({ gte: 1n, lte: 100n });
    });

    it('stores the rates, so the season is reproducible rather than asserted', async () => {
        vi.mocked(prisma.battleReceipt.findMany).mockResolvedValue([receiptRow(ALICE, BOB, true)] as never);
        await buildSeason(INPUTS);

        const created = tx.rewardSeason.create.mock.calls[0]![0] as { data: { params: unknown; totalAmount: string } };
        expect(created.data.params).toEqual({ perWin: '100', perLoss: '25', perBattleCap: '1000' });
        expect(created.data.totalAmount).toBe('125');
    });

    it('writes the season and its entitlements in one transaction', async () => {
        vi.mocked(prisma.battleReceipt.findMany).mockResolvedValue([receiptRow(ALICE, BOB, true)] as never);
        await buildSeason(INPUTS);

        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        const entitlements = tx.rewardEntitlement.createMany.mock.calls[0]![0] as { data: { leafIndex: number }[] };
        expect(entitlements.data.map((e) => e.leafIndex)).toEqual([0, 1]);
    });

    it('refuses to overwrite an existing season', async () => {
        // Changing entitlements after they are readable is exactly what the contract's
        // immutability prevents; allowing it here would just move the problem upstream.
        vi.mocked(prisma.rewardSeason.findUnique).mockResolvedValue({ seasonId: 1 } as never);

        await expect(buildSeason(INPUTS)).rejects.toThrow(/already exists/);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses a season with no anchored receipts', async () => {
        vi.mocked(prisma.battleReceipt.findMany).mockResolvedValue([] as never);
        await expect(buildSeason(INPUTS)).rejects.toThrow(/no anchored receipts/);
    });

    it('refuses a receipt payload missing the owners or the result', async () => {
        vi.mocked(prisma.battleReceipt.findMany).mockResolvedValue([{ payload: { snapshot: {} } }] as never);
        await expect(buildSeason(INPUTS)).rejects.toThrow(/missing the owners or the result/);
    });
});

describe('claim proofs', () => {
    const entitlements = [
        { wallet: ALICE, amount: '100', leafIndex: 0, breakdown: { battles: 1 } },
        { wallet: BOB, amount: '125', leafIndex: 1, breakdown: { battles: 2 } },
        { wallet: CAROL, amount: '25', leafIndex: 2, breakdown: { battles: 1 } },
    ];

    function storedSeason(root?: string) {
        const leaves = entitlements.map((e) =>
            rewardMerkleLeaf({
                chainId: 84532,
                distributor: DISTRIBUTOR,
                seasonId: 1,
                wallet: e.wallet,
                token: TOKEN,
                amount: BigInt(e.amount),
            }),
        );
        return {
            seasonId: 1,
            evmChainId: 84532,
            distributor: DISTRIBUTOR,
            token: TOKEN,
            merkleRoot: root ?? buildMerkleTree(leaves).root,
            entitlements,
        };
    }

    it('returns a proof that verifies against the recorded root', async () => {
        const season = storedSeason();
        vi.mocked(prisma.rewardSeason.findUnique).mockResolvedValue(season as never);

        const claim = await getClaimProof(1, BOB);

        expect(claim?.amount).toBe('125');
        const leaf = rewardMerkleLeaf({
            chainId: 84532,
            distributor: DISTRIBUTOR,
            seasonId: 1,
            wallet: BOB,
            token: TOKEN,
            amount: 125n,
        });
        expect(verifyMerkleProof(leaf, claim!.proof, season.merkleRoot as `0x${string}`)).toBe(true);
    });

    it('matches a wallet regardless of casing', async () => {
        vi.mocked(prisma.rewardSeason.findUnique).mockResolvedValue(storedSeason() as never);
        const claim = await getClaimProof(1, ALICE.toUpperCase().replace('0X', '0x'));
        expect(claim?.wallet).toBe(ALICE);
    });

    it('includes the breakdown, so a player asking why gets an answer', async () => {
        vi.mocked(prisma.rewardSeason.findUnique).mockResolvedValue(storedSeason() as never);
        expect((await getClaimProof(1, BOB))?.breakdown).toEqual({ battles: 2 });
    });

    it('returns null for a wallet with no entitlement', async () => {
        vi.mocked(prisma.rewardSeason.findUnique).mockResolvedValue(storedSeason() as never);
        await expect(getClaimProof(1, '0x9999999999999999999999999999999999999999')).resolves.toBeNull();
    });

    it('returns null for an unknown season', async () => {
        vi.mocked(prisma.rewardSeason.findUnique).mockResolvedValue(null);
        await expect(getClaimProof(99, ALICE)).resolves.toBeNull();
    });

    it('refuses when the stored entitlements no longer rebuild the recorded root', async () => {
        // Serving a proof against a recomputed root would produce something that verifies
        // nowhere on chain, and hide that the season drifted.
        vi.mocked(prisma.rewardSeason.findUnique).mockResolvedValue(storedSeason(`0x${'de'.repeat(32)}`) as never);
        await expect(getClaimProof(1, ALICE)).rejects.toThrow(/rebuilds to .* but was recorded as/);
    });
});
