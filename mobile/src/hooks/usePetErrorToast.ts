import { useEffect, useRef } from 'react';
import { usePetError } from '@shared/core';

import { useToast } from '../components/ui/toast';
import { CHAIN_MISMATCH_MESSAGE, isChainMismatchError } from '../utils/chainMismatch';

/**
 * Maps pet-action errors to friendly toast messages.
 * Raw transaction / contract errors are logged to the console only.
 */
export const usePetErrorToast = (
    mutationError: Error | null | undefined,
    receiptError: Error | null | undefined,
    validationError: string | null,
    fallbackMessage: string,
): void => {
    const toast = useToast();
    const display = usePetError(mutationError, receiptError, validationError, fallbackMessage);
    const lastKeyRef = useRef<string | null>(null);

    useEffect(() => {
        if (!display.message) {
            lastKeyRef.current = null;
            return;
        }

        const key = [
            validationError ?? '',
            mutationError?.message ?? '',
            receiptError?.message ?? '',
            display.message,
        ].join('|');

        if (key === lastKeyRef.current) return;
        lastKeyRef.current = key;

        if (receiptError) {
            console.error('[pet-action] receipt error:', receiptError);
        } else if (mutationError) {
            console.error('[pet-action] mutation error:', mutationError);
        } else if (validationError) {
            console.error('[pet-action] validation error:', validationError);
        }

        // Same override as useTxErrorToast: a wrong-network refusal otherwise arrives as
        // the caller's generic fallback, which tells the player to retry something that
        // cannot succeed until the wallet moves.
        if (isChainMismatchError(mutationError) || isChainMismatchError(receiptError)) {
            toast.error(CHAIN_MISMATCH_MESSAGE);
            return;
        }

        if (display.isUserRejection) {
            toast.info(display.message);
            return;
        }

        toast.error(display.message);
    }, [
        display.message,
        display.isUserRejection,
        mutationError,
        receiptError,
        validationError,
        toast,
    ]);
};
