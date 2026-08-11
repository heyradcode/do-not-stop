import { describe, expect, it } from 'vitest';

import { buildMerkleTree } from '@cryptopets/protocol';

import {
    checkRewardClaim,
    checkRewardRoot,
    rewardLeafFor,
    type PublishedEntitlement,
    type SeasonBinding,
} from '../../src/checks';

/**
 * Reward-season checks, over both leaf layouts.
 *
 * The cases that matter are the ones where the published list and the published root
 * disagree: a wrong amount, a missing wallet, a reordering. All three produce a claim the
 * distributor rejects, and an operator could ship any of them by accident.
 */

const EVM: SeasonBinding = {
    family: 'evm',
    chainId: 84532,
    distributor: '0x1111111111111111111111111111111111111111',
    token: '0x2222222222222222222222222222222222222222',
    seasonId: 1,
};

const SOLANA: SeasonBinding = {
    family: 'solana',
    chainRef: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
    distributor: 'RewaRDsFhqhVBHrHFHKcnbXPPHUvNSVKWnxNBXjHkVh',
    token: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    seasonId: 2,
};

const EVM_ENTITLEMENTS: PublishedEntitlement[] = [
    { wallet: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', amount: 100n },
    { wallet: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', amount: 125n },
    { wallet: '0xcccccccccccccccccccccccccccccccccccccccc', amount: 25n },
];

const SOL_ENTITLEMENTS: PublishedEntitlement[] = [
    { wallet: 'HN7cABqLq46Es1jh92dQQpjP4LxRo7vLYCsRoQ8HWzEA', amount: 100n },
    { wallet: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', amount: 25n },
];

function rootFor(binding: SeasonBinding, entitlements: readonly PublishedEntitlement[]): string {
    return buildMerkleTree(entitlements.map((entitlement) => rewardLeafFor(binding, entitlement))).root;
}

describe.each([
    ['evm', EVM, EVM_ENTITLEMENTS] as const,
    ['solana', SOLANA, SOL_ENTITLEMENTS] as const,
])('%s seasons', (_family, binding, entitlements) => {
    const root = rootFor(binding, entitlements);

    it('accepts entitlements that rebuild the published root', () => {
        expect(checkRewardRoot(binding, entitlements, root)).toMatchObject({ ok: true });
    });

    it('rejects a published list whose amounts differ from the root', () => {
        const tampered = entitlements.map((entitlement, index) =>
            index === 0 ? { ...entitlement, amount: entitlement.amount + 1n } : entitlement,
        );
        const result = checkRewardRoot(binding, tampered, root);

        expect(result.ok).toBe(false);
        expect(result.detail).toMatch(/rebuild(s)? to .* but the published root is/);
    });

    it('rejects a published list missing a wallet', () => {
        expect(checkRewardRoot(binding, entitlements.slice(1), root).ok).toBe(false);
    });

    it('verifies a claim for a wallet in the list', () => {
        expect(checkRewardClaim(binding, entitlements, root, entitlements[0]!.wallet)).toMatchObject({
            ok: true,
            subject: entitlements[0]!.wallet,
        });
    });

    // Not entitled is a legitimate answer, not an error: a caller asking about a wallet with
    // no reward should be told so.
    it('reports a wallet with no entitlement rather than throwing', () => {
        const result = checkRewardClaim(binding, entitlements, root, 'nobody');
        expect(result.ok).toBe(false);
        expect(result.detail).toMatch(/no entitlement/);
    });

    it('rejects a claim against a root the list does not produce', () => {
        const otherRoot = `0x${'99'.repeat(32)}`;
        expect(checkRewardClaim(binding, entitlements, otherRoot, entitlements[0]!.wallet).ok).toBe(false);
    });
});

describe('ordering', () => {
    const root = rootFor(EVM, EVM_ENTITLEMENTS);

    // Not every reordering is detectable, and pretending otherwise would be a false claim.
    // `merkleNode` hashes a sorted pair, so two leaves that are siblings can be swapped
    // without moving the root. Harmless: any ordering that reproduces the root produces
    // verifying proofs for every wallet in it, which is what a claim needs.
    it('accepts a swap of two siblings, which the sorted node hash cannot see', () => {
        const swapped = [EVM_ENTITLEMENTS[1]!, EVM_ENTITLEMENTS[0]!, EVM_ENTITLEMENTS[2]!];

        expect(checkRewardRoot(EVM, swapped, root).ok).toBe(true);
    });

    // What is detectable, and what actually matters: a permutation that changes which
    // leaves pair up produces a different tree.
    it('rejects a reordering that changes which leaves pair up', () => {
        const moved = [EVM_ENTITLEMENTS[2]!, EVM_ENTITLEMENTS[0]!, EVM_ENTITLEMENTS[1]!];

        expect(checkRewardRoot(EVM, moved, root).ok).toBe(false);
    });

    it('still verifies a claim under a sibling swap', () => {
        const swapped = [EVM_ENTITLEMENTS[1]!, EVM_ENTITLEMENTS[0]!, EVM_ENTITLEMENTS[2]!];

        expect(checkRewardClaim(EVM, swapped, root, EVM_ENTITLEMENTS[0]!.wallet).ok).toBe(true);
    });
});

describe('the two layouts stay apart', () => {
    // Same season number, same amounts, different account widths. If a Solana list ever
    // rebuilt an EVM root, a proof from one chain would claim on the other.
    it('does not let one family rebuild the other family root', () => {
        const evmRoot = rootFor(EVM, EVM_ENTITLEMENTS);
        expect(checkRewardRoot(SOLANA, SOL_ENTITLEMENTS, evmRoot).ok).toBe(false);
    });

    it('refuses an evm address under the wide layout rather than padding it', () => {
        const result = checkRewardRoot(SOLANA, EVM_ENTITLEMENTS, rootFor(EVM, EVM_ENTITLEMENTS));
        expect(result.ok).toBe(false);
        expect(result.detail).toMatch(/could not build the reward tree/);
    });
});

describe('malformed input', () => {
    it('reports an empty season rather than reproducing an empty root', () => {
        const result = checkRewardRoot(EVM, [], `0x${'00'.repeat(32)}`);
        expect(result.ok).toBe(false);
        expect(result.detail).toMatch(/no entitlements/);
    });
});
