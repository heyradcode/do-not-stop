import { isEvmAddress } from '@utils';

/** Chains the app indexes and matches pets across. Single source of truth. */
export const SUPPORTED_CHAINS = ['evm', 'solana'] as const;

export type Chain = (typeof SUPPORTED_CHAINS)[number];

export function isSupportedChain(value: string): value is Chain {
    return (SUPPORTED_CHAINS as readonly string[]).includes(value);
}

/**
 * Which chain a wallet address belongs to, by its shape.
 *
 * A wallet only exists on one chain, so this is derivable rather than something a caller
 * should be asked for — asking would let them name the wrong one. Uses the same
 * case-insensitive EVM test as auth, so a checksummed address is not misread as Solana.
 */
export function chainOfAccount(address: string): Chain {
    return isEvmAddress(address) ? 'evm' : 'solana';
}
