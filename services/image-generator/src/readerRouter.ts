/**
 * Dispatches a read to whichever chain's reader owns it.
 *
 * Kept separate from both readers so neither has to know the other exists, and so
 * a chain with no configuration is a clear "not configured" error rather than a
 * crash on a missing RPC URL. Running EVM-only is a supported deployment: the
 * Solana reader is only constructed when its env vars are present.
 */

import { SUPPORTED_CHAINS, UnsupportedChainError, type OnChainPet, type PetReader } from './chain.js';

export class ChainNotConfiguredError extends Error {
    constructor(chain: string) {
        super(`Chain "${chain}" is supported but not configured on this deployment`);
        this.name = 'ChainNotConfiguredError';
    }
}

export const createReaderRouter = (readers: Partial<Record<string, PetReader>>): PetReader => ({
    async read(chain: string, tokenId: string): Promise<OnChainPet> {
        // Distinguishes "this service does not do that chain" from "this
        // deployment was not given credentials for it": the first is permanent,
        // the second is a config fix. SUPPORTED_CHAINS is the single source of
        // truth, so adding a reader cannot leave the two answers inconsistent.
        if (!(SUPPORTED_CHAINS as readonly string[]).includes(chain)) {
            throw new UnsupportedChainError(chain);
        }

        const reader = readers[chain];
        if (!reader) throw new ChainNotConfiguredError(chain);

        return reader.read(chain, tokenId);
    },
});
