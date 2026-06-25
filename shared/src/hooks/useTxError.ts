import { useMemo } from 'react';
import { useChainCapabilities } from './useChainCapabilities';

export type TxError = {
    message: string;
    isUserRejection: boolean;
};

export const useTxError = (
    writeError: unknown,
    fallback = 'Transaction failed. Please try again.',
): TxError | null => {
    const { parseError } = useChainCapabilities();

    return useMemo(() => {
        if (!writeError) return null;
        const { message, isUserRejection } = parseError(writeError, fallback);
        return { message, isUserRejection };
    }, [writeError, parseError, fallback]);
};
