import { BN } from '@coral-xyz/anchor';

/** Coerce Anchor-decoded numeric account fields (often `BN`) to a JS `number` for u32-sized values. */
export const toU32 = (n: unknown): number  => {
    if (BN.isBN(n)) {
        return (n as BN).toNumber();
    }
    return Number(n);
}

/**
 * Format a lamports bigint as a human-readable SOL string (up to 9 decimal
 * places, no trailing zeros, no thousands separator).
 * e.g. 10_000_000n → "0.01", 20_000_000n → "0.02"
 */
export const formatLamports = (lamports: bigint): string =>
    (Number(lamports) / 1e9).toLocaleString('en-US', { maximumFractionDigits: 9, useGrouping: false });
