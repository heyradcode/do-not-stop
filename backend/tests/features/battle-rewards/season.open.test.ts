import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/prisma', () => ({
    prisma: { rewardSeason: { findUnique: vi.fn(), update: vi.fn() } },
}));

import { prisma } from '@config/prisma';
import { boundsViolations, openSeasonOnChain, type OpenSeasonContext } from '@features/battle-rewards';

const ALICE = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const BOB = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const TOKEN = '0x2222222222222222222222222222222222222222';
const TX_HASH = `0x${'ee'.repeat(32)}`;

const readContract = vi.fn();
const writeContract = vi.fn();
const waitForTransactionReceipt = vi.fn();

function context(): OpenSeasonContext {
    return {
        publicClient: { readContract, waitForTransactionReceipt } as never,
        walletClient: { writeContract } as never,
        distributor: '0x1111111111111111111111111111111111111111',
    };
}

const REQUEST = {
    seasonId: 1,
    perWalletCap: 1000n,
    seasonCap: 5000n,
    claimsOpenAt: 0n,
    claimsCloseAt: 4_000_000_000n,
};

function season(overrides: Record<string, unknown> = {}) {
    return {
        seasonId: 1,
        merkleRoot: `0x${'11'.repeat(32)}`,
        token: TOKEN,
        totalAmount: '600',
        openedAt: null,
        openedTxHash: null,
        entitlements: [
            { wallet: ALICE, amount: '400' },
            { wallet: BOB, amount: '200' },
        ],
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.rewardSeason.findUnique).mockResolvedValue(season() as never);
    vi.mocked(prisma.rewardSeason.update).mockResolvedValue({} as never);
    readContract.mockResolvedValue(10_000n);
    writeContract.mockResolvedValue(TX_HASH);
    waitForTransactionReceipt.mockResolvedValue({ status: 'success' });
});

describe('opening a season that can be paid in full', () => {
    it('opens it and records the transaction', async () => {
        const outcome = await openSeasonOnChain(context(), REQUEST);

        expect(outcome).toEqual({ status: 'opened', txHash: TX_HASH, totalAmount: 600n });
        expect(prisma.rewardSeason.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ openedTxHash: TX_HASH }) }),
        );
    });

    it('passes the stored root and the caller-supplied caps', async () => {
        await openSeasonOnChain(context(), REQUEST);

        const call = writeContract.mock.calls[0]![0] as { args: unknown[] };
        expect(call.args).toEqual([1, `0x${'11'.repeat(32)}`, TOKEN, 1000n, 5000n, 0n, 4_000_000_000n]);
    });

    it('does nothing for a season that was never built', async () => {
        vi.mocked(prisma.rewardSeason.findUnique).mockResolvedValue(null);
        await expect(openSeasonOnChain(context(), REQUEST)).resolves.toEqual({ status: 'season-not-built' });
        expect(writeContract).not.toHaveBeenCalled();
    });

    it('does not reopen a season already opened', async () => {
        vi.mocked(prisma.rewardSeason.findUnique).mockResolvedValue(
            season({ openedAt: new Date(), openedTxHash: TX_HASH }) as never,
        );

        await expect(openSeasonOnChain(context(), REQUEST)).resolves.toEqual({
            status: 'already-opened',
            txHash: TX_HASH,
        });
        expect(writeContract).not.toHaveBeenCalled();
    });
});

describe('refusing a season that could not be honoured', () => {
    it('refuses when an entitlement exceeds the per-wallet cap', async () => {
        // That wallet could never claim, and would find out only by trying.
        const outcome = await openSeasonOnChain(context(), { ...REQUEST, perWalletCap: 300n });

        expect(outcome).toMatchObject({ status: 'refused' });
        expect((outcome as { reasons: string[] }).reasons.join(' ')).toContain('per-wallet cap');
        expect(writeContract).not.toHaveBeenCalled();
    });

    it('refuses when the total exceeds the season cap', async () => {
        // The contract enforces caps per claim, first come first served, so this would pay
        // early claimants in full and revert on the last ones.
        const outcome = await openSeasonOnChain(context(), { ...REQUEST, seasonCap: 500n });

        expect((outcome as { reasons: string[] }).reasons.join(' ')).toContain('first-come-first-served');
        expect(writeContract).not.toHaveBeenCalled();
    });

    it('refuses when the distributor is underfunded', async () => {
        // Caps bound what may be claimed; only the balance decides what can be.
        readContract.mockResolvedValue(100n);

        const outcome = await openSeasonOnChain(context(), REQUEST);

        expect((outcome as { reasons: string[] }).reasons.join(' ')).toContain('holds 100');
        expect(writeContract).not.toHaveBeenCalled();
    });

    it('reports every reason at once rather than one transaction at a time', async () => {
        readContract.mockResolvedValue(0n);
        const outcome = await openSeasonOnChain(context(), { ...REQUEST, perWalletCap: 100n, seasonCap: 100n });

        expect((outcome as { reasons: string[] }).reasons).toHaveLength(3);
    });

    it('reports a reverted open without marking the season opened', async () => {
        waitForTransactionReceipt.mockResolvedValue({ status: 'reverted' });

        const outcome = await openSeasonOnChain(context(), REQUEST);

        expect(outcome).toMatchObject({ status: 'refused' });
        expect(prisma.rewardSeason.update).not.toHaveBeenCalled();
    });

    it('checks the balance of the distributor, in the season token', async () => {
        await openSeasonOnChain(context(), REQUEST);

        const call = readContract.mock.calls[0]![0] as { address: string; args: string[] };
        expect(call.address).toBe(TOKEN);
        expect(call.args[0]).toBe('0x1111111111111111111111111111111111111111');
    });
});

describe('boundsViolations', () => {
    const entitlements = [
        { wallet: ALICE, amount: 400n },
        { wallet: BOB, amount: 200n },
    ];

    it('passes a season that fits under every bound', () => {
        expect(
            boundsViolations({
                entitlements,
                totalAmount: 600n,
                balance: 600n,
                perWalletCap: 400n,
                seasonCap: 600n,
            }),
        ).toEqual([]);
    });

    it('treats the caps as inclusive, so an exact fit is allowed', () => {
        // An entitlement exactly at the cap is claimable; refusing it would be an
        // off-by-one that silently disenfranchises the boundary case.
        expect(
            boundsViolations({
                entitlements: [{ wallet: ALICE, amount: 100n }],
                totalAmount: 100n,
                balance: 100n,
                perWalletCap: 100n,
                seasonCap: 100n,
            }),
        ).toEqual([]);
    });

    it('counts how many entitlements are over the cap, and samples a few', () => {
        const many = Array.from({ length: 10 }, (_, i) => ({ wallet: `0x${String(i).repeat(40)}`, amount: 999n }));
        const [reason] = boundsViolations({
            entitlements: many,
            totalAmount: 9990n,
            balance: 9990n,
            perWalletCap: 1n,
            seasonCap: 10_000n,
        });

        expect(reason).toContain('10 entitlement(s)');
        // Samples rather than listing every address.
        expect(reason!.split('=').length - 1).toBe(3);
    });

    it('is pure, so candidate caps can be tested without a chain', () => {
        const tooTight = boundsViolations({ entitlements, totalAmount: 600n, balance: 600n, perWalletCap: 1n, seasonCap: 600n });
        const workable = boundsViolations({ entitlements, totalAmount: 600n, balance: 600n, perWalletCap: 400n, seasonCap: 600n });

        expect(tooTight).not.toEqual([]);
        expect(workable).toEqual([]);
    });
});
