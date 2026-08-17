import { useCallback } from 'react';

import { useToast } from '../components/ui/Toast';

/** Logs technical details to the console and shows a friendly toast to the user. */
export const useNotifyError = () => {
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
};
