import { useEffect, useRef } from 'react';
import { useTxError } from '@shared/core';

import { useToast } from '../components/ui/toast';
import { CHAIN_MISMATCH_MESSAGE, isChainMismatchError } from '../utils/chainMismatch';

export const useTxErrorToast = (
    writeError: unknown,
    fallback = 'Transaction failed. Please try again.',
) => {
    const parsed = useTxError(writeError, fallback);
    // The shared parser has no case for it, so it reaches the player as the fallback,
    // "Transaction failed. Please try again." Trying again is exactly what does not work.
    const mismatched = isChainMismatchError(writeError);
    const toast = useToast();
    const lastKeyRef = useRef<string | null>(null);

    useEffect(() => {
        if (!parsed) {
            lastKeyRef.current = null;
            return;
        }

        const key = `${String(writeError)}|${parsed.message}`;
        if (key === lastKeyRef.current) return;
        lastKeyRef.current = key;

        console.error('[contract-write]', writeError);

        if (mismatched) {
            toast.error(CHAIN_MISMATCH_MESSAGE);
            return;
        }

        if (parsed.isUserRejection) {
            toast.info(parsed.message);
            return;
        }

        toast.error(parsed.message);
    }, [parsed, mismatched, writeError, toast]);
};
