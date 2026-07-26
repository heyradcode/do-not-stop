import { buildMerkleTree, merkleProof, rewardMerkleLeaf, type Hex } from '@cryptopets/protocol';

import { prisma } from '@config/prisma';

import {
    computeEntitlements,
    totalEntitled,
    type BattleContribution,
    type RewardRates,
    type WalletEntitlement,
} from './entitlements';

/**
 * Building and serving a reward season (§I).
 *
 * A season is computed once, from receipts that are already anchored, and then frozen. Two
 * properties matter more than anything else here:
 *
 * - **Only anchored receipts count.** An unanchored receipt is signed and public but its
 *   batch root is not yet immutable, so rewarding it would mean paying against a history we
 *   could still, in principle, reorganise. Waiting for the anchor costs latency and buys the
 *   guarantee the whole design is for.
 * - **A season is reproducible.** The sequence range, the rates, and the entitlement list
 *   are all stored, so a player can rebuild the root from the public corpus and check that
 *   their number is the one we published. A season that could only be verified by asking us
 *   would be the assertion this design exists to avoid.
 */

export interface SeasonInputs {
    seasonId: number;
    chainId: string;
    deploymentId: string;
    /** Inclusive receipt sequence range. */
    firstSequence: bigint;
    lastSequence: bigint;
    /** Distributor the leaves bind to, and the EVM chain it lives on. */
    distributor: string;
    evmChainId: number;
    token: string;
    rates: RewardRates;
}

export interface BuiltSeason {
    seasonId: number;
    merkleRoot: Hex;
    totalAmount: bigint;
    entitlements: WalletEntitlement[];
}

/**
 * Computes a season and records it.
 *
 * Refuses to overwrite an existing season, matching `SeasonRewardDistributor.openSeason`'s
 * own refusal: once entitlements are readable, changing them retroactively is exactly the
 * move the contract's immutability exists to prevent, and allowing it here would just move
 * the problem upstream of the chain.
 */
export async function buildSeason(inputs: SeasonInputs): Promise<BuiltSeason> {
    const existing = await prisma.rewardSeason.findUnique({ where: { seasonId: inputs.seasonId } });
    if (existing) {
        throw new Error(`season ${inputs.seasonId} already exists; supersede it with a new season rather than editing it`);
    }

    const contributions = await loadAnchoredContributions(inputs);
    if (contributions.length === 0) {
        throw new Error(
            `no anchored receipts in sequence range ${inputs.firstSequence}..${inputs.lastSequence}; ` +
                'a season over nothing would publish a root nobody can claim against',
        );
    }

    const entitlements = computeEntitlements(contributions, inputs.rates);
    const leaves = entitlements.map((entitlement) =>
        rewardMerkleLeaf({
            chainId: inputs.evmChainId,
            distributor: inputs.distributor,
            seasonId: inputs.seasonId,
            wallet: entitlement.wallet,
            token: inputs.token,
            amount: entitlement.amount,
        }),
    );
    const tree = buildMerkleTree(leaves);
    const totalAmount = totalEntitled(entitlements);

    await prisma.$transaction(async (tx) => {
        await tx.rewardSeason.create({
            data: {
                seasonId: inputs.seasonId,
                chainId: inputs.chainId,
                deploymentId: inputs.deploymentId,
                firstSequence: inputs.firstSequence,
                lastSequence: inputs.lastSequence,
                distributor: inputs.distributor.toLowerCase(),
                evmChainId: inputs.evmChainId,
                token: inputs.token.toLowerCase(),
                merkleRoot: tree.root,
                totalAmount: totalAmount.toString(),
                // Stored so the season is reproducible rather than merely asserted.
                params: {
                    perWin: inputs.rates.perWin.toString(),
                    perLoss: inputs.rates.perLoss.toString(),
                    perBattleCap: inputs.rates.perBattleCap.toString(),
                },
            },
        });
        await tx.rewardEntitlement.createMany({
            data: entitlements.map((entitlement, leafIndex) => ({
                seasonId: inputs.seasonId,
                wallet: entitlement.wallet,
                amount: entitlement.amount.toString(),
                leafIndex,
                breakdown: entitlement.breakdown,
            })),
        });
    });

    return { seasonId: inputs.seasonId, merkleRoot: tree.root, totalAmount, entitlements };
}

/** Every anchored battle in the range, in the shape the entitlement maths needs. */
async function loadAnchoredContributions(inputs: SeasonInputs): Promise<BattleContribution[]> {
    const receipts = await prisma.battleReceipt.findMany({
        where: {
            chainId: inputs.chainId,
            deploymentId: inputs.deploymentId,
            sequence: { gte: inputs.firstSequence, lte: inputs.lastSequence },
            // Anchored only: `anchoredAt` is set when the batch root is on chain.
            batch: { anchoredAt: { not: null } },
        },
        orderBy: { sequence: 'asc' },
        select: { payload: true },
    });

    return receipts.map((receipt) => {
        const payload = receipt.payload as {
            snapshot?: { attacker?: { owner?: unknown }; defender?: { owner?: unknown } };
            result?: { attackerWon?: unknown };
        };
        const attackerOwner = payload?.snapshot?.attacker?.owner;
        const defenderOwner = payload?.snapshot?.defender?.owner;
        const attackerWon = payload?.result?.attackerWon;
        if (typeof attackerOwner !== 'string' || typeof defenderOwner !== 'string' || typeof attackerWon !== 'boolean') {
            throw new Error('anchored receipt payload is missing the owners or the result');
        }
        return { attackerOwner, defenderOwner, attackerWon };
    });
}

export interface ClaimProof {
    seasonId: number;
    wallet: string;
    amount: string;
    merkleRoot: string;
    proof: Hex[];
    breakdown: unknown;
}

/**
 * The proof a wallet needs to claim its season entitlement.
 *
 * Rebuilt from the stored entitlements rather than persisted per wallet, for the same
 * reason batch inclusion proofs are: a stored proof duplicates a tree that is cheap to
 * recompute and can drift from it. The rebuilt root is checked against the recorded one, so
 * a drift surfaces instead of producing a proof that verifies against nothing on chain.
 */
export async function getClaimProof(seasonId: number, wallet: string): Promise<ClaimProof | null> {
    const season = await prisma.rewardSeason.findUnique({
        where: { seasonId },
        include: { entitlements: { orderBy: { leafIndex: 'asc' } } },
    });
    if (!season) return null;

    const target = wallet.toLowerCase();
    const index = season.entitlements.findIndex((entitlement) => entitlement.wallet === target);
    if (index < 0) return null;

    const leaves = season.entitlements.map((entitlement) =>
        rewardMerkleLeaf({
            chainId: season.evmChainId,
            distributor: season.distributor,
            seasonId: season.seasonId,
            wallet: entitlement.wallet,
            token: season.token,
            amount: BigInt(entitlement.amount),
        }),
    );
    const tree = buildMerkleTree(leaves);
    if (tree.root.toLowerCase() !== season.merkleRoot.toLowerCase()) {
        throw new Error(
            `season ${seasonId} rebuilds to ${tree.root} but was recorded as ${season.merkleRoot}`,
        );
    }

    const entitlement = season.entitlements[index]!;
    return {
        seasonId,
        wallet: target,
        amount: entitlement.amount,
        merkleRoot: season.merkleRoot,
        proof: merkleProof(tree, index),
        breakdown: entitlement.breakdown,
    };
}
