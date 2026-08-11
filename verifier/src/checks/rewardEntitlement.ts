import {
    buildMerkleTree,
    merkleProof,
    rewardMerkleLeafFor,
    verifyMerkleProof,
    type FamilyRewardEntitlement,
    type Hex,
} from '@cryptopets/protocol';

import type { CheckResult } from './types';

/**
 * Checking a published reward season without asking the operator anything (§I).
 *
 * Every other check in this package is about one battle. These are about the *payout*
 * derived from many, which is a different claim and a stronger one: a receipt says a fight
 * happened, a reward leaf says a wallet may withdraw a specific amount of a specific asset.
 *
 * What these prove and what they do not:
 *
 * - **The published root is the one the published entitlements produce.** That is what stops
 *   an operator posting a root, showing everyone a list, and having the two differ. It says
 *   nothing about whether the amounts are *fair*, which is what the recorded rates and
 *   sequence range are for: recomputing those needs the receipt corpus, which the caller
 *   already has, and is the job of whatever produced `entitlements` here.
 * - **A specific wallet's proof verifies against that root.** A claim the distributor will
 *   accept, checked before spending a transaction discovering otherwise.
 *
 * Both families are handled by the one function, because the only difference is how wide an
 * account is and `rewardMerkleLeafFor` already absorbs that. A verifier that reimplemented
 * either layout would be the third copy of an encoding two chains already have to agree on.
 */

/** One wallet's published entitlement, in tree order. */
export interface PublishedEntitlement {
    wallet: string;
    amount: bigint;
}

/**
 * What a season binds its leaves to, minus the per-wallet fields.
 *
 * The same values the distributor supplies itself at claim time: on EVM `block.chainid` and
 * `address(this)`, on Solana the season account's `chain_ref` and the program id. A caller
 * takes them from the chain rather than from the operator, which is what makes this check
 * independent rather than a restatement.
 */
export type SeasonBinding =
    | { family: 'evm'; chainId: number; distributor: string; token: string; seasonId: number }
    | { family: 'solana'; chainRef: string; distributor: string; token: string; seasonId: number };

/** The leaf for one entitlement under a season's binding. */
export function rewardLeafFor(binding: SeasonBinding, entitlement: PublishedEntitlement): Hex {
    const common = { seasonId: binding.seasonId, wallet: entitlement.wallet, amount: entitlement.amount };
    const full: FamilyRewardEntitlement =
        binding.family === 'solana'
            ? {
                  family: 'solana',
                  chainRef: binding.chainRef,
                  distributor: binding.distributor,
                  token: binding.token,
                  ...common,
              }
            : {
                  family: 'evm',
                  chainId: binding.chainId,
                  distributor: binding.distributor,
                  token: binding.token,
                  ...common,
              };
    return rewardMerkleLeafFor(full);
}

/**
 * Confirms the published entitlements rebuild the published root.
 *
 * Takes a sequence rather than a set, because the tree is built over leaves in the order
 * given and that order is part of what the root commits to. It is only *partly* part of it,
 * though, and the distinction is worth knowing: `merkleNode` hashes a sorted pair, so
 * swapping two leaves that are siblings leaves the root unchanged, while any permutation
 * that changes which leaves pair up does not. So this confirms the published list produces
 * the published root; it does not confirm the list is in the exact order the operator used.
 *
 * That is enough for what the check is for. A claim needs a proof that verifies, and any
 * ordering reproducing the root produces verifying proofs for every wallet in it.
 */
export function checkRewardRoot(
    binding: SeasonBinding,
    entitlements: readonly PublishedEntitlement[],
    publishedRoot: string,
): CheckResult {
    const check = 'reward-root';
    if (entitlements.length === 0) {
        return { check, ok: false, detail: 'season published no entitlements, so no root can be reproduced' };
    }

    let rebuilt: Hex;
    try {
        rebuilt = buildMerkleTree(entitlements.map((entitlement) => rewardLeafFor(binding, entitlement))).root;
    } catch (error) {
        return { check, ok: false, detail: `could not build the reward tree: ${describe(error)}` };
    }

    return rebuilt.toLowerCase() === publishedRoot.toLowerCase()
        ? { check, ok: true }
        : { check, ok: false, detail: `entitlements rebuild to ${rebuilt} but the published root is ${publishedRoot}` };
}

/**
 * Confirms one wallet's claim would be accepted against the published root.
 *
 * The proof is rebuilt here rather than taken from the operator on purpose. A supplied proof
 * that verifies proves only that the operator can produce a consistent pair; rebuilding it
 * from the published list proves the wallet is in the list the root commits to.
 */
export function checkRewardClaim(
    binding: SeasonBinding,
    entitlements: readonly PublishedEntitlement[],
    publishedRoot: string,
    wallet: string,
): CheckResult {
    const check = 'reward-claim';
    const index = entitlements.findIndex((entitlement) => entitlement.wallet === wallet);
    if (index < 0) {
        // Deliberately not an error: "not entitled" is a legitimate answer, and a caller
        // asking about a wallet with no reward should be told so rather than thrown at.
        return { check, ok: false, subject: wallet, detail: 'wallet has no entitlement in this season' };
    }

    let leaf: Hex;
    let proof: Hex[];
    try {
        const tree = buildMerkleTree(entitlements.map((entitlement) => rewardLeafFor(binding, entitlement)));
        leaf = rewardLeafFor(binding, entitlements[index]!);
        proof = merkleProof(tree, index);
    } catch (error) {
        return { check, ok: false, subject: wallet, detail: `could not build the reward tree: ${describe(error)}` };
    }

    return verifyMerkleProof(leaf, proof, publishedRoot as Hex)
        ? { check, ok: true, subject: wallet }
        : { check, ok: false, subject: wallet, detail: `proof for ${wallet} does not verify against ${publishedRoot}` };
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message.split('\n')[0]! : String(error);
}
