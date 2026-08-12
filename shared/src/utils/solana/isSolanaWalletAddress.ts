import { PublicKey } from '@solana/web3.js';

/**
 * Whether `address` is a Solana address someone can hold a private key for.
 *
 * Not "is this a valid pubkey", which is what the name and doc used to claim: a program
 * derived address is perfectly valid and this returns false for it. Roughly half of all
 * 32-byte values are off the ed25519 curve, so this is also the sharpest cheap check on a
 * mistyped address — base58 carries no checksum, so a typo usually still parses.
 *
 * Deliberately advisory rather than a validity test. A PDA can own a Metaplex Core asset,
 * and a program built to move it can move it again, so "off-curve" means "only a program can
 * spend from here", not "lost". Callers should warn on false, not refuse.
 */
export const isSolanaWalletAddress = (address: string): boolean => {
    const trimmed = address.trim();
    if (!trimmed) {
        return false;
    }
    try {
        const key = new PublicKey(trimmed);
        return PublicKey.isOnCurve(key.toBytes());
    } catch {
        return false;
    }
};
