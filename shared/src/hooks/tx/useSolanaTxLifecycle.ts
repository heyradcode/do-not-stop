import { useCallback, useState } from 'react';

import type { TxLifecycle, TxPhase } from '../adapters/types';

/**
 * Lifecycle state for one Solana write, in the shape the adapters report EVM writes in.
 *
 * EVM gets this for free from wagmi's `useWriteContract` + `useWaitForTransactionReceipt`
 * pair. A Solana `.rpc()` is a single call that resolves once confirmed, so there is nothing
 * to poll and the phases have to be tracked by hand.
 *
 * **One instance per action, never shared between two.** The EVM branch uses a separate write
 * hook per action for a stated reason — an equip in flight must not blank an unequip's error
 * — and a shared instance here reintroduces exactly that: the second action clears the first
 * one's error on start, and `isPending` reads true on both buttons while either is running.
 *
 * Deliberately reports only `awaiting-wallet` then `success` or `error`. There is no
 * `confirming` phase because there is no interval where the transaction is sent but not yet
 * confirmed that a caller could observe; inventing one to match EVM's shape would be a
 * fiction the UI would render as a real state.
 */
export interface SolanaTxLifecycle {
    lifecycle: TxLifecycle;
    isPending: boolean;
    /** Runs `send`, tracking the phases around it. Rethrows so callers still see failures. */
    run<T>(send: () => Promise<T>): Promise<T>;
}

export function useSolanaTxLifecycle(): SolanaTxLifecycle {
    const [phase, setPhase] = useState<TxPhase>('idle');
    const [error, setError] = useState<Error | null>(null);

    const run = useCallback(async <T,>(send: () => Promise<T>): Promise<T> => {
        setPhase('awaiting-wallet');
        setError(null);
        try {
            const result = await send();
            setPhase('success');
            return result;
        } catch (caught) {
            setError(caught as Error);
            setPhase('error');
            // Rethrown, not swallowed: a caller awaiting the mutation has to see the failure,
            // and react-query needs it to mark the mutation rejected.
            throw caught;
        }
    }, []);

    const reset = useCallback(() => {
        setPhase('idle');
        setError(null);
    }, []);

    return {
        lifecycle: { phase, error, reset },
        isPending: phase === 'awaiting-wallet',
        run,
    };
}
