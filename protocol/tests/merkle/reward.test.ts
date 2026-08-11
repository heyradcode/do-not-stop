import { describe, expect, it } from 'vitest';

import { MERKLE_LEAF_DOMAIN } from '../../src/merkle/tree';
import { merkleLeaf } from '../../src/merkle';
import { assertSupportedSchemaVersion } from '../../src/domain/schemaVersions';
import { bytesToBase58 } from '../../src/encoding/base58';
import {
    MERKLE_REWARD_LEAF_DOMAIN,
    rewardMerkleLeaf,
    rewardMerkleLeafFor,
    WIDE_REWARD_LEAF_SCHEMA_VERSION,
    wideRewardMerkleLeaf,
    type RewardEntitlement,
    type WideRewardEntitlement,
} from '../../src/merkle/reward';

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

// ─── Version 2: the wide-account layout ───────────────────────────────────────

const WIDE: WideRewardEntitlement = {
    chainRef: `0x${'33'.repeat(32)}`,
    distributor: `0x${'44'.repeat(32)}`,
    seasonId: 1,
    wallet: `0x${'55'.repeat(32)}`,
    token: `0x${'66'.repeat(32)}`,
    amount: 1_000_000_000_000_000_000n,
};

/**
 * Both layouts pinned as literal digests.
 *
 * This is the whole point of the file. A reward leaf that changes invalidates every proof
 * already published under it, and the deployed EVM distributor reproduces version 1's bytes
 * in Solidity, so a drift here is not caught by anything else until claims start failing.
 */
describe('frozen vectors', () => {
    it('version 1 has not moved', () => {
        expect(rewardMerkleLeaf(BASE)).toBe(
            '0x97342e7eef5bdf2111da91367d6c6b0203974fa2dcb5fb4d8e37fd8ee82b8365',
        );
    });

    it('version 2 has not moved', () => {
        expect(wideRewardMerkleLeaf(WIDE)).toBe(
            '0x0d423a28d5eaddae26ea9578435a3df0b863fc6ee70d0e091d9779d12d298d49',
        );
    });
});

describe('wide reward leaves', () => {
    it('is deterministic', () => {
        expect(wideRewardMerkleLeaf(WIDE)).toBe(wideRewardMerkleLeaf({ ...WIDE }));
    });

    it('produces a 32-byte digest', () => {
        expect(wideRewardMerkleLeaf(WIDE)).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it.each([
        ['chainRef', { chainRef: `0x${'77'.repeat(32)}` }],
        ['distributor', { distributor: `0x${'77'.repeat(32)}` }],
        ['seasonId', { seasonId: 2 }],
        ['wallet', { wallet: `0x${'77'.repeat(32)}` }],
        ['token', { token: `0x${'77'.repeat(32)}` }],
        ['amount', { amount: 2n }],
    ])('changing %s changes the leaf', (_field, patch) => {
        expect(wideRewardMerkleLeaf({ ...WIDE, ...patch })).not.toBe(wideRewardMerkleLeaf(WIDE));
    });

    // Base58 is how a Solana pubkey is written everywhere a human sees one, and 0x-hex is
    // how a genesis hash may arrive. The same 32 bytes must hash the same either way, or an
    // entitlement built from a config file differs from one built from an RPC response.
    it('reads base58 and 0x-hex as the same bytes', () => {
        const asHex = `0x${'44'.repeat(32)}`;
        const asBase58 = bytesToBase58(new Uint8Array(32).fill(0x44));

        expect(wideRewardMerkleLeaf({ ...WIDE, distributor: asBase58 })).toBe(
            wideRewardMerkleLeaf({ ...WIDE, distributor: asHex }),
        );
    });
});

describe('the two layouts cannot be confused', () => {
    // Same tag, different version field and different length. Either alone would do; both
    // is deliberate, since the version is only two bytes deep in a 32-byte-tagged preimage.
    it('shares the domain tag but not the digest', () => {
        const sameish = wideRewardMerkleLeaf({
            chainRef: `0x${(84532).toString(16).padStart(64, '0')}`,
            distributor: `0x${BASE.distributor.slice(2).padStart(64, '0')}`,
            seasonId: BASE.seasonId,
            wallet: `0x${BASE.wallet.slice(2).padStart(64, '0')}`,
            token: `0x${BASE.token.slice(2).padStart(64, '0')}`,
            amount: BASE.amount,
        });
        expect(sameish).not.toBe(rewardMerkleLeaf(BASE));
    });

    it('declares 2 as the wide version', () => {
        expect(WIDE_REWARD_LEAF_SCHEMA_VERSION).toBe(2);
    });

    // Both permanently, because they are chosen by account width rather than by age.
    it.each([1, 2])('supports version %s', (version) => {
        expect(() => assertSupportedSchemaVersion('merkleRewardLeaf', version)).not.toThrow();
    });

    it('still refuses an unknown version', () => {
        expect(() => assertSupportedSchemaVersion('merkleRewardLeaf', 3)).toThrow(/unsupported/);
    });
});

describe('rejecting malformed wide entitlements', () => {
    // Left-padding would let one account produce a leaf under both layouts, and silently
    // accepting a short value is how a truncated key becomes an entitlement payable to nobody.
    it('rejects a 20-byte EVM address rather than padding it', () => {
        expect(() => wideRewardMerkleLeaf({ ...WIDE, wallet: BASE.wallet })).toThrow(/must be 32 bytes/);
    });

    it('rejects an empty account', () => {
        expect(() => wideRewardMerkleLeaf({ ...WIDE, token: '' })).toThrow(/empty/);
    });

    it('rejects a base58 string that decodes to the wrong length', () => {
        expect(() => wideRewardMerkleLeaf({ ...WIDE, wallet: 'abc' })).toThrow(/must be 32 bytes/);
    });

    it('rejects a non-base58 character rather than skipping it', () => {
        expect(() => wideRewardMerkleLeaf({ ...WIDE, wallet: `0${'1'.repeat(43)}` })).toThrow();
    });

    it('rejects an amount that does not fit in uint256', () => {
        expect(() => wideRewardMerkleLeaf({ ...WIDE, amount: 1n << 256n })).toThrow(/uint256/);
    });
});

describe('choosing a layout by family', () => {
    it('uses version 1 for evm', () => {
        expect(rewardMerkleLeafFor({ family: 'evm', ...BASE })).toBe(rewardMerkleLeaf(BASE));
    });

    it('uses version 2 for solana', () => {
        expect(rewardMerkleLeafFor({ family: 'solana', ...WIDE })).toBe(wideRewardMerkleLeaf(WIDE));
    });
});
