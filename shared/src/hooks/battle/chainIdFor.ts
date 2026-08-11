import type { ChainId } from '@cryptopets/protocol';

/**
 * Picks the served chain id matching the connected wallet's family.
 *
 * One copy, shared by everything that has to name a chain to the backend: granting consent,
 * reading it back, and submitting an intent. It was written out identically in the first
 * two of those, which is the sort of duplication that stays harmless right up until the
 * deployment serves two chains of one family and only one caller learns how to choose.
 *
 * Throws rather than returning null. Every caller is midway through building an object the
 * player is about to sign, and a chain id guessed wrong produces a signature that verifies
 * against nothing — refused later as `wrong-deployment`, after the wallet prompt, which is
 * the worst place to discover it.
 */
export function chainIdFor(kind: 'evm' | 'solana', servedChainIds: string[]): ChainId {
    const match = tryChainIdFor(kind, servedChainIds);
    if (!match) {
        throw new Error(`this deployment serves no ${kind} chain (has ${servedChainIds.join(', ') || 'none'})`);
    }
    return match;
}

/**
 * The same lookup, returning null instead of throwing.
 *
 * For callers deciding *whether* something is possible rather than building something to
 * sign — which in practice means anything running during render. `chainIdFor` throwing
 * there does not surface as a handled error, it unmounts the tree: a wallet connected to a
 * family this deployment does not serve would take the whole screen down instead of
 * disabling one button.
 */
export function tryChainIdFor(kind: 'evm' | 'solana', servedChainIds: string[]): ChainId | null {
    const prefix = kind === 'evm' ? 'eip155:' : 'solana:';
    return (servedChainIds.find((candidate) => candidate.startsWith(prefix)) as ChainId | undefined) ?? null;
}
