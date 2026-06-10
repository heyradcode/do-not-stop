import { PublicKey } from '@solana/web3.js';

/** Parse a base58 program id string; returns `null` if missing or invalid. */
export const parseProgramId = (raw: string | undefined | null): PublicKey | null  => {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) {
        return null;
    }
    try {
        return new PublicKey(trimmed);
    } catch {
        return null;
    }
}
