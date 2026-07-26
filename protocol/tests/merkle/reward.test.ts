import { describe, expect, it } from 'vitest';

import { MERKLE_LEAF_DOMAIN } from '../../src/merkle/tree';
import { merkleLeaf } from '../../src/merkle';
import { MERKLE_REWARD_LEAF_DOMAIN, rewardMerkleLeaf, type RewardEntitlement } from '../../src/merkle/reward';

const BASE: RewardEntitlement = {
    chainId: 84532,
    distributor: '0x1111111111111111111111111111111111111111',
    seasonId: 1,
    wallet: '0xabcdef0123456789abcdef0123456789abcdef01',
    token: '0x2222222222222222222222222222222222222222',
    amount: 1_000_000_000_000_000_000n,
};

describe('reward leaves', () => {
    it('is deterministic', () => {
        expect(rewardMerkleLeaf(BASE)).toBe(rewardMerkleLeaf({ ...BASE }));
    });

    it('produces a 32-byte digest', () => {
        expect(rewardMerkleLeaf(BASE)).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('uses a different domain from receipt leaves', () => {
        // Without separate tags a receipt hash could be presented where a reward leaf is
        // expected, turning "this battle happened" into "pay me".
        expect(MERKLE_REWARD_LEAF_DOMAIN).not.toBe(MERKLE_LEAF_DOMAIN);
    });

    it('never collides with a receipt leaf', () => {
        const receiptShaped = merkleLeaf(`0x${'11'.repeat(32)}`);
        expect(rewardMerkleLeaf(BASE)).not.toBe(receiptShaped);
    });
});

describe('every field the claim binds changes the leaf', () => {
    it.each([
        ['chainId', { chainId: 8453 }],
        ['distributor', { distributor: '0x3333333333333333333333333333333333333333' }],
        ['seasonId', { seasonId: 2 }],
        ['wallet', { wallet: '0x4444444444444444444444444444444444444444' }],
        ['token', { token: '0x5555555555555555555555555555555555555555' }],
        ['amount', { amount: BASE.amount + 1n }],
    ])('%s', (_field, patch) => {
        expect(rewardMerkleLeaf({ ...BASE, ...patch })).not.toBe(rewardMerkleLeaf(BASE));
    });

    it('makes a proof non-transferable between deployments', () => {
        // The same entitlement computed for staging hashes differently from production, so
        // a staging proof is simply not in the production tree.
        const staging = rewardMerkleLeaf({ ...BASE, distributor: '0x9999999999999999999999999999999999999999' });
        expect(staging).not.toBe(rewardMerkleLeaf(BASE));
    });

    it('makes a proof non-transferable between chains', () => {
        expect(rewardMerkleLeaf({ ...BASE, chainId: 1 })).not.toBe(rewardMerkleLeaf(BASE));
    });

    it('makes a proof non-transferable between seasons', () => {
        expect(rewardMerkleLeaf({ ...BASE, seasonId: 99 })).not.toBe(rewardMerkleLeaf(BASE));
    });
});

describe('normalization', () => {
    it('treats a checksummed address as the same wallet', () => {
        // Otherwise one person could hold two entitlements depending on how their address
        // was spelled when the tree was built.
        const checksummed = { ...BASE, wallet: BASE.wallet.toUpperCase().replace('0X', '0x') };
        expect(rewardMerkleLeaf(checksummed)).toBe(rewardMerkleLeaf(BASE));
    });

    it('normalizes the distributor and token the same way', () => {
        expect(
            rewardMerkleLeaf({
                ...BASE,
                distributor: BASE.distributor.toUpperCase().replace('0X', '0x'),
                token: BASE.token.toUpperCase().replace('0X', '0x'),
            }),
        ).toBe(rewardMerkleLeaf(BASE));
    });
});

describe('rejecting malformed entitlements', () => {
    it('rejects a non-address wallet', () => {
        expect(() => rewardMerkleLeaf({ ...BASE, wallet: '0x1234' })).toThrow(/20-byte EVM address/);
    });

    it('rejects a negative amount', () => {
        expect(() => rewardMerkleLeaf({ ...BASE, amount: -1n })).toThrow(/uint256/);
    });

    it('rejects an amount that does not fit in uint256', () => {
        expect(() => rewardMerkleLeaf({ ...BASE, amount: 1n << 256n })).toThrow(/uint256/);
    });

    it('accepts a zero amount, which is a real entitlement of nothing', () => {
        expect(() => rewardMerkleLeaf({ ...BASE, amount: 0n })).not.toThrow();
    });

    it.each([-1, 1.5])('rejects %s as a season id', (seasonId) => {
        expect(() => rewardMerkleLeaf({ ...BASE, seasonId })).toThrow(/non-negative integer/);
    });
});
