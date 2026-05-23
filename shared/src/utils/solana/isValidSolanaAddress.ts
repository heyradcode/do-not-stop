import { PublicKey } from '@solana/web3.js';

/** Returns true when `address` is a valid Solana base58 public key. */
export function isValidSolanaAddress(address: string): boolean {
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
}
