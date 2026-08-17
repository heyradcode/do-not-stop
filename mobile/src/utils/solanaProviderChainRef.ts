/**
 * Normalizes an AppKit / WalletConnect Solana chain id for `provider.request`.
 *
 * The sign client wants a CAIP-2 reference (`solana:<cluster>`), but AppKit
 * reports `chainId` in both forms depending on where it came from, so callers
 * cannot assume either. `createReownSolanaWallet` carried a private copy of this
 * before; two normalizations of the same thing in one directory drift.
 *
 * The fallback is the app's own Solana target rather than a guess: an unset
 * `CRYPTOPETS_SOLANA_RPC` resolves to devnet, and `CRYPTOPETS_PROGRAM_ID` is a
 * devnet deploy. It mirrors `TARGET_CHAIN_ID` defaulting to Sepolia on the EVM
 * side — a missing chain id means "the chain this build targets", not "give up".
 */
export function solanaProviderChainRef(
    chainId: string | number | undefined,
    fallback = 'solana:devnet',
): string {
    if (chainId === undefined || chainId === null || chainId === '') {
        return fallback;
    }
    const s = String(chainId);
    return s.includes(':') ? s : `solana:${s}`;
}
