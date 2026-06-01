import { useCallback } from 'react';
import { useToast } from '@components/common/toast';

/** Logs technical details to the console and shows a friendly toast to the user. */
export function useNotifyError() {
    const toast = useToast();

    return useCallback(
        (message: string, rawError?: unknown, context = 'action') => {
            if (rawError !== undefined) {
                console.error(`[${context}]`, rawError);
            } else {
                console.error(`[${context}]`, message);
            }
            toast.error(message);
        },
        [toast],
    );
}

/** Logs a cancellation/info message without treating it as a hard failure. */
export function useNotifyInfo() {
    const toast = useToast();

    return useCallback(
        (message: string, rawError?: unknown, context = 'action') => {
            if (rawError !== undefined) {
                console.error(`[${context}]`, rawError);
            }
            toast.info(message);
        },
        [toast],
    );
}

/** Logs receipt/confirmation failures with a generic user-facing message. */
export function useNotifyReceiptError() {
    const notifyError = useNotifyError();

    return useCallback(
        (rawError: unknown, fallback = 'Transaction failed. Please try again.') => {
            notifyError(fallback, rawError, 'transaction-receipt');
        },
        [notifyError],
    );
}
