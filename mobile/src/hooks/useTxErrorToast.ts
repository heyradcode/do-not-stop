import { useEffect, useRef } from 'react';
import { useTxError } from '@shared/core';

import { useToast } from '../components/ui/toast';

export const useTxErrorToast = (
    writeError: unknown,
    fallback = 'Transaction failed. Please try again.',
) => {
    const parsed = useTxError(writeError, fallback);
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

        if (parsed.isUserRejection) {
            toast.info(parsed.message);
            return;
        }

        toast.error(parsed.message);
    }, [parsed, writeError, toast]);
};
