import type { AdapterMutation } from './types';

/**
 * The chain-blind surface for claiming a season reward (§I).
 *
 * A third interface alongside `ChainAdapter` and `InventoryAdapter`, for the reason §4 gives
 * for the second: new domains reuse the *pattern* — thin interface, per-chain
 * implementation, a `useXAdapter()` that picks the active one — rather than growing the pet
 * adapter, which `AGENTS.md` forbids.
 *
 * Only the claim lives here, and the boundary is the same one inventory draws. Reading a
 * season and its proof is unauthenticated REST (`useRewardSeason`, `useRewardClaim`);
 * spending the proof is a chain write the player signs. Nothing else about rewards is a
 * wallet action: seasons are opened by an operator key, deliberately not over HTTP.
 */

export interface ClaimRewardArgs {
    seasonId: number;
    /**
     * Who gets paid. Bound inside the leaf, so this is never the connected wallet by
     * assumption — a sponsor may send the transaction for someone else, and on neither chain
     * can they redirect the payout.
     */
    wallet: string;
    /** Amount in the token's smallest unit, as a decimal string. */
    amount: string;
    /** Sibling hashes from `useRewardClaim`. */
    proof: string[];
    /**
     * Where the claim is honoured, taken from the season rather than from deployment config.
     *
     * A season records its own distributor because a proof is bound to one: leaves built for
     * staging are not in production's tree. Reading it from config instead would let a
     * client aim a valid proof at the wrong contract and fail after the wallet prompt.
     */
    distributor: string;
    /** ERC-20 address on EVM, SPL mint on Solana. Also from the season. */
    token: string;
    /** EVM only: the numeric chain id the distributor lives on. */
    evmChainId?: number | null;
}

export interface RewardsAdapter {
    kind: 'evm' | 'solana' | 'none';
    /**
     * Whether this chain can claim at all.
     *
     * False with no wallet connected. A UI reads this to disable the button with a reason
     * rather than offering one that throws.
     */
    canClaim: boolean;
    claim: AdapterMutation<ClaimRewardArgs>;
}
