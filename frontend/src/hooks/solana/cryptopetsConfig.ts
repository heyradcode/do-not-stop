import { PublicKey } from '@solana/web3.js';

/** CryptoPets program id from env; `null` if missing or invalid. */
export function getCryptopetsProgramId(): PublicKey | null {
    const raw = import.meta.env.VITE_CRYPTOPETS_PROGRAM_ID;
    if (!raw?.trim()) {
        return null;
    }
    try {
        return new PublicKey(raw.trim());
    } catch {
        return null;
    }
}

export function isCryptopetsConfigured(): boolean {
    return getCryptopetsProgramId() !== null;
}
