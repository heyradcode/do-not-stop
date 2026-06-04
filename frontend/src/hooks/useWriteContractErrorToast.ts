import { useEffect, useRef } from 'react';
import { formatSolanaActionError, parseContractError, useActiveChain } from '@shared/core';
import { useToast } from '@components/ui/toast';

/**
 * Shows write/contract errors as friendly toasts.
 * Raw errors are logged to the console only.
 */
export function useWriteContractErrorToast(
    writeError: unknown,
    fallback = 'Transaction failed. Please try again.',
) {
    const chain = useActiveChain();
    const toast = useToast();
    const lastKeyRef = useRef<string | null>(null);

    useEffect(() => {
        if (!writeError) {
            lastKeyRef.current = null;
            return;
        }

        const message = formatSolanaActionError(writeError, fallback);
        const parsed =
            chain.kind === 'solana'
                ? {
                      message,
                      isUserRejection: message.toLowerCase().includes('cancelled'),
                      isContractError: true,
                  }
                : parseContractError(writeError);

        const key = `${String(writeError)}|${parsed.message}`;
        if (key === lastKeyRef.current) return;
        lastKeyRef.current = key;

        console.error('[contract-write]', writeError);

        if (parsed.isUserRejection) {
            toast.info(parsed.message);
            return;
        }

        toast.error(parsed.message);
    }, [writeError, chain.kind, fallback, toast]);
}
