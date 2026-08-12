import {
    buildMerkleTree,
    chainFamily,
    merkleProof,
    normalizeAccount,
    rewardMerkleLeafFor,
    type ChainId,
    type Hex,
} from '@cryptopets/protocol';

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

/**
 * What a leaf binds a claim to, which differs by family and not by much.
 *
 * Both name a distributor and an asset. They differ only in how the chain itself is
 * identified: EVM has `block.chainid`, and Solana has nothing a program can read, so its
 * leaves carry the cluster's genesis hash instead (see `cryptopets_rewards`' `chain_ref`).
 */
export type SeasonTarget =
    | {
          family: 'evm';
          /** The `SeasonRewardDistributor` contract. */
          distributor: string;
          evmChainId: number;
          /** ERC-20 the season pays in. */
          token: string;
          /** The token's decimals, for display. Never enters a leaf. */
          decimals?: number;
      }
    | {
          family: 'solana';
          /** The `cryptopets_rewards` program id. */
          distributor: string;
          /** Cluster genesis hash, base58 or 0x-hex. */
          chainRef: string;
          /** SPL mint the season pays in. */
          token: string;
          /** The mint's decimals, for display. Never enters a leaf. */
          decimals?: number;
      };

export interface SeasonInputs {
    seasonId: number;
    chainId: string;
    deploymentId: string;
    /** Inclusive receipt sequence range. */
    firstSequence: bigint;
    lastSequence: bigint;
    /**
     * Where the claim will be honoured.
     *
     * Its family must match `chainId`'s. A season's battles and its payout are on the same
     * chain by construction: the owners in those receipts are that chain's accounts, so
     * there is nobody in an EVM season a Solana distributor could pay.
     */
    target: SeasonTarget;
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

    assertTargetMatchesChain(inputs.chainId, inputs.target);

    const contributions = await loadAnchoredContributions(inputs);
    if (contributions.length === 0) {
        throw new Error(
            `no anchored receipts in sequence range ${inputs.firstSequence}..${inputs.lastSequence}; ` +
                'a season over nothing would publish a root nobody can claim against',
        );
    }

    const entitlements = computeEntitlements(contributions, inputs.rates);
    const leaves = entitlements.map((entitlement) =>
        seasonLeaf(inputs.target, inputs.seasonId, entitlement.wallet, entitlement.amount),
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
                // `normalizeAccount`, not `toLowerCase`: base58 is case-sensitive, so
                // lowercasing a Solana program id or mint produces a different key rather
                // than a different spelling of the same one, and every leaf built from it
                // would be unclaimable.
                distributor: normalizeAccount(inputs.target.distributor),
                evmChainId: inputs.target.family === 'evm' ? inputs.target.evmChainId : null,
                chainRef: inputs.target.family === 'solana' ? inputs.target.chainRef : null,
                token: normalizeAccount(inputs.target.token),
                // Display only: the leaf binds `token` and `amount` in the smallest unit,
                // so recording this cannot move the root. Null when the caller did not
                // supply it, which a client renders as base units rather than guessing.
                tokenDecimals: inputs.target.decimals ?? null,
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

/**
 * One entitlement's leaf, under the layout its chain's verifier implements.
 *
 * The single place either layout is chosen, so `buildSeason` and `getClaimProof` cannot
 * disagree. They would have to produce identical bytes anyway, and a proof served under a
 * layout the tree was not built with fails on chain with nothing to point at.
 */
function seasonLeaf(target: SeasonTarget, seasonId: number, wallet: string, amount: bigint): Hex {
    return target.family === 'solana'
        ? rewardMerkleLeafFor({
              family: 'solana',
              chainRef: target.chainRef,
              distributor: target.distributor,
              seasonId,
              wallet,
              token: target.token,
              amount,
          })
        : rewardMerkleLeafFor({
              family: 'evm',
              chainId: target.evmChainId,
              distributor: target.distributor,
              seasonId,
              wallet,
              token: target.token,
              amount,
          });
}

/**
 * Refuses a season whose payout chain is not the chain its battles were fought on.
 *
 * Not a formality. The owners in those receipts are that chain's accounts, so an EVM
 * distributor has nobody in a Solana season to pay: every leaf would name a 32-byte pubkey
 * as a 20-byte address, and the mismatch would surface as an unclaimable root rather than
 * an error anyone could read.
 */
function assertTargetMatchesChain(chainId: string, target: SeasonTarget): void {
    const family = chainFamily(chainId as ChainId);
    if (family !== target.family) {
        throw new Error(
            `season on ${chainId} is a ${family} chain but its distributor is ${target.family}; ` +
                'a season pays out on the chain its battles were fought on',
        );
    }
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

/**
 * Rebuilds a stored season's target.
 *
 * The two chain-identity columns are nullable and exactly one is set, which the type system
 * cannot express through Prisma. Throwing on a row with the wrong one populated is the
 * point: silently defaulting would rebuild the tree under the other family's layout and
 * serve proofs that fail on chain, and the root check below would blame the entitlements.
 */
function storedTarget(season: {
    chainId: string;
    distributor: string;
    token: string;
    evmChainId: number | null;
    chainRef: string | null;
}): SeasonTarget {
    if (chainFamily(season.chainId as ChainId) === 'solana') {
        if (!season.chainRef) {
            throw new Error(`solana season on ${season.chainId} has no chain_ref recorded`);
        }
        return {
            family: 'solana',
            distributor: season.distributor,
            chainRef: season.chainRef,
            token: season.token,
        };
    }
    if (season.evmChainId === null) {
        throw new Error(`evm season on ${season.chainId} has no evm_chain_id recorded`);
    }
    return {
        family: 'evm',
        distributor: season.distributor,
        evmChainId: season.evmChainId,
        token: season.token,
    };
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

    // `normalizeAccount`, matching how the wallet was stored. Lowercasing here would make
    // every Solana lookup miss, which reads as "you have no entitlement" rather than as a
    // bug.
    const target = normalizeAccount(wallet);
    const index = season.entitlements.findIndex((entitlement) => entitlement.wallet === target);
    if (index < 0) return null;

    const seasonTarget = storedTarget(season);
    const leaves = season.entitlements.map((entitlement) =>
        seasonLeaf(seasonTarget, season.seasonId, entitlement.wallet, BigInt(entitlement.amount)),
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
