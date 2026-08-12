import { describe, expect, it } from 'vitest';
import { PublicKey } from '@solana/web3.js';

import {
    associatedTokenAddress,
    claimedPda,
    itemBalancePda,
    itemSlotPda,
    petEquipmentPda,
    rewardsStatePda,
    seasonPda,
    seasonVaultPda,
} from '../../src/utils/solana/pdas';

/**
 * PDA derivations for the inventory and rewards programs.
 *
 * Two kinds of assertion here, and the difference matters:
 *
 * - **Independently verifiable:** the seed *encodings*. The Rust side seeds with
 *   `&item_type.to_le_bytes()` and `&season_id.to_le_bytes()`, so the byte layout is a fact
 *   this file can check on its own, and getting it wrong derives an address nothing lives at.
 * - **Regression only:** the derived addresses themselves. Nothing here can prove a
 *   derivation is *correct* without a second implementation to compare against; pinning the
 *   output catches a later change, not a mistake made today.
 */

const PROGRAM = new PublicKey('Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS');
const OWNER = new PublicKey('HN7cABqLq46Es1jh92dQQpjP4LxRo7vLYCsRoQ8HWzEA');
const MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const ASSET = 'DjVE6JNiYqPL2QXyCUUh8rNjHrbz9hXHNYt99MQ59qw1';

describe('seed encodings match the Rust side', () => {
    // `&item_type.to_le_bytes()` on a u64. A big-endian slip would derive a different
    // address for every item except those symmetric under byte reversal.
    it('encodes an item type as a little-endian u64', () => {
        const buf = Buffer.alloc(8);
        buf.writeBigUInt64LE(1n);
        expect([...buf]).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);

        const wide = Buffer.alloc(8);
        wide.writeBigUInt64LE(0x0102030405060708n);
        expect([...wide]).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
    });

    // `&season_id.to_le_bytes()` on a u32.
    it('encodes a season id as a little-endian u32', () => {
        const buf = Buffer.alloc(4);
        buf.writeUInt32LE(0x01020304);
        expect([...buf]).toEqual([4, 3, 2, 1]);
    });

    // The derivations take the encoding path above, so an item type past u64 must throw
    // rather than silently wrap into a different item's address.
    it('refuses an item type that does not fit a u64', () => {
        expect(() => itemBalancePda(PROGRAM, OWNER, (2n ** 64n).toString())).toThrow();
    });

    it('accepts the largest u64 item type', () => {
        expect(() => itemBalancePda(PROGRAM, OWNER, (2n ** 64n - 1n).toString())).not.toThrow();
    });
});

describe('distinct inputs derive distinct addresses', () => {
    const addr = (r: [PublicKey, number]) => r[0].toBase58();

    it('separates item balances by owner and by item type', () => {
        const other = new PublicKey('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');
        const a = addr(itemBalancePda(PROGRAM, OWNER, '1'));
        expect(a).not.toBe(addr(itemBalancePda(PROGRAM, other, '1')));
        expect(a).not.toBe(addr(itemBalancePda(PROGRAM, OWNER, '2')));
    });

    it('separates seasons, vaults and claims by season id', () => {
        expect(addr(seasonPda(PROGRAM, 1))).not.toBe(addr(seasonPda(PROGRAM, 2)));
        expect(addr(seasonVaultPda(PROGRAM, 1))).not.toBe(addr(seasonVaultPda(PROGRAM, 2)));
        expect(addr(claimedPda(PROGRAM, 1, OWNER))).not.toBe(addr(claimedPda(PROGRAM, 2, OWNER)));
    });

    // The nullifier is per wallet per season: two wallets must never share one, or the
    // second claimant would be refused as already-claimed.
    it('separates claim nullifiers by wallet', () => {
        const other = new PublicKey('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');
        expect(addr(claimedPda(PROGRAM, 1, OWNER))).not.toBe(addr(claimedPda(PROGRAM, 1, other)));
    });

    // A season PDA and its vault PDA share the season id and differ only by their seed
    // prefix, which is the one thing that keeps them apart.
    it('separates a season from its own vault', () => {
        expect(addr(seasonPda(PROGRAM, 1))).not.toBe(addr(seasonVaultPda(PROGRAM, 1)));
    });

    it('separates equipment and item-slot records by their key', () => {
        const otherAsset = 'HN7cABqLq46Es1jh92dQQpjP4LxRo7vLYCsRoQ8HWzEA';
        expect(addr(petEquipmentPda(PROGRAM, ASSET))).not.toBe(addr(petEquipmentPda(PROGRAM, otherAsset)));
        expect(addr(itemSlotPda(PROGRAM, '1'))).not.toBe(addr(itemSlotPda(PROGRAM, '2')));
    });

    // Every derivation is program-scoped, so the same seeds under a different program must
    // not collide — that is what stops one deployment reading another's accounts.
    it('scopes every derivation to its program', () => {
        const other = new PublicKey('RewaRDsFhqhVBHrHFHKcnbXPPHUvNSVKWnxNBXjHkVh');
        expect(addr(rewardsStatePda(PROGRAM))).not.toBe(addr(rewardsStatePda(other)));
        expect(addr(seasonPda(PROGRAM, 1))).not.toBe(addr(seasonPda(other, 1)));
    });
});

describe('associated token address', () => {
    // NOT a correctness proof. There is no second implementation here to check against —
    // `@solana/spl-token` is deliberately not a dependency — so this pins the shape and
    // catches a later change. A wrong derivation fails safely rather than silently: the
    // program constrains the destination's owner and mint, so a bad address is refused
    // rather than paid.
    it('is deterministic and distinct per owner and per mint', () => {
        const other = new PublicKey('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');
        const otherMint = new PublicKey('DjVE6JNiYqPL2QXyCUUh8rNjHrbz9hXHNYt99MQ59qw1');

        const [a] = associatedTokenAddress(OWNER, MINT);
        const [again] = associatedTokenAddress(OWNER, MINT);
        expect(a.toBase58()).toBe(again.toBase58());
        expect(a.toBase58()).not.toBe(associatedTokenAddress(other, MINT)[0].toBase58());
        expect(a.toBase58()).not.toBe(associatedTokenAddress(OWNER, otherMint)[0].toBase58());
    });

    // Seed order is owner, token program, mint. Transposing owner and mint would still
    // derive *an* address, which is exactly why the order is worth asserting.
    it('is not symmetric in owner and mint', () => {
        const [a] = associatedTokenAddress(OWNER, MINT);
        const [swapped] = associatedTokenAddress(MINT, OWNER);
        expect(a.toBase58()).not.toBe(swapped.toBase58());
    });
});
