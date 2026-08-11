import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildMerkleTree, rewardMerkleLeafFor, verifyMerkleProof } from '@cryptopets/protocol';

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

const EVM_TARGET = {
    family: 'evm' as const,
    distributor: DISTRIBUTOR,
    evmChainId: 84532,
    token: TOKEN,
};

const INPUTS: SeasonInputs = {
    seasonId: 1,
    chainId: 'eip155:84532',
    deploymentId: 'base-sepolia-live',
    firstSequence: 1n,
    lastSequence: 100n,
    target: EVM_TARGET,
    rates: { perWin: 100n, perLoss: 25n, perBattleCap: 1000n },
};

// Base58, and deliberately mixed-case: lowercasing any of these produces a different
// pubkey rather than a different spelling of the same one.
const SOL_ALICE = 'HN7cABqLq46Es1jh92dQQpjP4LxRo7vLYCsRoQ8HWzEA';
const SOL_BOB = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const SOL_DISTRIBUTOR = 'RewaRDsFhqhVBHrHFHKcnbXPPHUvNSVKWnxNBXjHkVh';
const SOL_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOL_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';

const SOLANA_TARGET = {
    family: 'solana' as const,
    distributor: SOL_DISTRIBUTOR,
    chainRef: SOL_GENESIS,
    token: SOL_MINT,
};

const SOLANA_INPUTS: SeasonInputs = {
    ...INPUTS,
    seasonId: 2,
    chainId: 'solana:devnet',
    deploymentId: 'devnet-live',
    target: SOLANA_TARGET,
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
            rewardMerkleLeafFor({ family: 'evm', ...EVM_TARGET, chainId: 84532, seasonId: 1, wallet: e.wallet, amount: BigInt(e.amount) }),
        );
        return {
            seasonId: 1,
            chainId: 'eip155:84532',
            evmChainId: 84532,
            chainRef: null,
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
        const leaf = rewardMerkleLeafFor({
            family: 'evm',
            ...EVM_TARGET,
            chainId: 84532,
            seasonId: 1,
            wallet: BOB,
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

describe('solana seasons', () => {
    function solanaReceipts() {
        vi.mocked(prisma.battleReceipt.findMany).mockResolvedValue([
            receiptRow(SOL_ALICE, SOL_BOB, true),
        ] as never);
    }

    it('builds a season whose leaves use the wide layout', async () => {
        solanaReceipts();
        const season = await buildSeason(SOLANA_INPUTS);

        const expected = buildMerkleTree(
            season.entitlements.map((e) =>
                rewardMerkleLeafFor({
                    family: 'solana',
                    ...SOLANA_TARGET,
                    seasonId: 2,
                    wallet: e.wallet,
                    amount: e.amount,
                }),
            ),
        ).root;
        expect(season.merkleRoot).toBe(expected);
    });

    // The bug this change exists to fix. Base58 is case-sensitive, so lowercasing a Solana
    // pubkey yields a different key, and every leaf built from it is unclaimable.
    it('stores the distributor and mint without lowercasing them', async () => {
        solanaReceipts();
        await buildSeason(SOLANA_INPUTS);

        const created = tx.rewardSeason.create.mock.calls[0]![0] as {
            data: { distributor: string; token: string; chainRef: string; evmChainId: number | null };
        };
        expect(created.data.distributor).toBe(SOL_DISTRIBUTOR);
        expect(created.data.token).toBe(SOL_MINT);
        expect(created.data.chainRef).toBe(SOL_GENESIS);
        expect(created.data.evmChainId).toBeNull();
    });

    it('leaves chain_ref null on an evm season', async () => {
        vi.mocked(prisma.battleReceipt.findMany).mockResolvedValue([receiptRow(ALICE, BOB, true)] as never);
        await buildSeason(INPUTS);

        const created = tx.rewardSeason.create.mock.calls[0]![0] as {
            data: { chainRef: string | null; evmChainId: number | null };
        };
        expect(created.data.chainRef).toBeNull();
        expect(created.data.evmChainId).toBe(84532);
    });

    // Every leaf would name a 32-byte pubkey as a 20-byte address. Better an error than an
    // unclaimable root nobody can trace back to this.
    it('refuses a distributor whose family is not the chain it pays for', async () => {
        solanaReceipts();
        await expect(
            buildSeason({ ...SOLANA_INPUTS, target: EVM_TARGET }),
        ).rejects.toThrow(/a season pays out on the chain its battles were fought on/);
    });

    it('refuses a solana distributor for an evm season', async () => {
        vi.mocked(prisma.battleReceipt.findMany).mockResolvedValue([receiptRow(ALICE, BOB, true)] as never);
        await expect(
            buildSeason({ ...INPUTS, target: SOLANA_TARGET }),
        ).rejects.toThrow(/a season pays out on the chain its battles were fought on/);
    });

    describe('claim proofs', () => {
        const solEntitlements = [
            { wallet: SOL_ALICE, amount: '100', leafIndex: 0, breakdown: { battles: 1 } },
            { wallet: SOL_BOB, amount: '25', leafIndex: 1, breakdown: { battles: 1 } },
        ];

        function storedSolanaSeason(overrides: Record<string, unknown> = {}) {
            const leaves = solEntitlements.map((e) =>
                rewardMerkleLeafFor({
                    family: 'solana',
                    ...SOLANA_TARGET,
                    seasonId: 2,
                    wallet: e.wallet,
                    amount: BigInt(e.amount),
                }),
            );
            return {
                seasonId: 2,
                chainId: 'solana:devnet',
                evmChainId: null,
                chainRef: SOL_GENESIS,
                distributor: SOL_DISTRIBUTOR,
                token: SOL_MINT,
                merkleRoot: buildMerkleTree(leaves).root,
                entitlements: solEntitlements,
                ...overrides,
            };
        }

        it('serves a proof that verifies against the recorded root', async () => {
            const season = storedSolanaSeason();
            vi.mocked(prisma.rewardSeason.findUnique).mockResolvedValue(season as never);

            const claim = await getClaimProof(2, SOL_BOB);

            expect(claim?.amount).toBe('25');
            const leaf = rewardMerkleLeafFor({
                family: 'solana',
                ...SOLANA_TARGET,
                seasonId: 2,
                wallet: SOL_BOB,
                amount: 25n,
            });
            expect(verifyMerkleProof(leaf, claim!.proof, season.merkleRoot as `0x${string}`)).toBe(true);
        });

        // Lowercasing here would make every Solana lookup miss, which reads to a player as
        // "you have no entitlement" rather than as a bug.
        it('finds a wallet whose base58 contains upper case', async () => {
            vi.mocked(prisma.rewardSeason.findUnique).mockResolvedValue(storedSolanaSeason() as never);
            expect((await getClaimProof(2, SOL_ALICE))?.wallet).toBe(SOL_ALICE);
        });

        it('refuses a solana season with no chain_ref rather than guessing one', async () => {
            vi.mocked(prisma.rewardSeason.findUnique).mockResolvedValue(
                storedSolanaSeason({ chainRef: null }) as never,
            );
            await expect(getClaimProof(2, SOL_BOB)).rejects.toThrow(/no chain_ref recorded/);
        });

        it('refuses an evm season with no evm_chain_id', async () => {
            vi.mocked(prisma.rewardSeason.findUnique).mockResolvedValue({
                ...storedSolanaSeason(),
                chainId: 'eip155:84532',
                chainRef: null,
                evmChainId: null,
            } as never);
            await expect(getClaimProof(2, SOL_BOB)).rejects.toThrow(/no evm_chain_id recorded/);
        });
    });
});
