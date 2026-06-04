/** Chains the app indexes and matches pets across. Single source of truth. */
export const SUPPORTED_CHAINS = ['evm', 'solana'] as const;

export type Chain = (typeof SUPPORTED_CHAINS)[number];

export function isSupportedChain(value: string): value is Chain {
    return (SUPPORTED_CHAINS as readonly string[]).includes(value);
}
