import { useEffect, useRef } from 'react';
import type { TxLifecycle } from '../adapters/types';

/**
 * Fires `onSuccess` exactly once when a mutation's lifecycle reaches
 * `success`, then resets the lifecycle so the next transaction starts from
 * idle. This is the single source of truth for settlement: on EVM `success`
 * means the receipt landed; on Solana the mutation resolves confirmed.
 *
 * Consumers must NOT read `lifecycle.phase` after `await mutate(...)` —
 * the closure captures the click-time render's phase, which is stale.
 */
export function useTxSuccess(lifecycle: TxLifecycle, onSuccess?: () => void): void {
    const callbackRef = useRef(onSuccess);
    callbackRef.current = onSuccess;
    // Guards against duplicate firing if extra renders commit while the
    // lifecycle is still in `success` (before the reset re-render lands).
    const handledRef = useRef(false);

    useEffect(() => {
        if (lifecycle.phase !== 'success') {
            handledRef.current = false;
            return;
        }
        if (handledRef.current) return;
        handledRef.current = true;
        callbackRef.current?.();
        lifecycle.reset();
    }, [lifecycle]);
}
