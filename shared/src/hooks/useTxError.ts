import { useMemo } from 'react';
import { useActiveChain } from './useActiveChain';
import { parseContractError } from '../utils/ethereum';
import { formatSolanaActionError } from '../utils/solana';

export type TxError = {
    message: string;
    isUserRejection: boolean;
};

export function useTxError(
    writeError: unknown,
    fallback = 'Transaction failed. Please try again.',
): TxError | null {
    const chain = useActiveChain();

    return useMemo(() => {
        if (!writeError) return null;

        if (chain.kind === 'solana') {
            const message = formatSolanaActionError(writeError, fallback);
            return {
                message,
                isUserRejection: message.toLowerCase().includes('cancelled'),
            };
        }

        const parsed = parseContractError(writeError);
        return {
            message: parsed.message,
            isUserRejection: parsed.isUserRejection,
        };
    }, [writeError, chain.kind, fallback]);
}
