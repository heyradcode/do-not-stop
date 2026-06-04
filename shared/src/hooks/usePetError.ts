import { useMemo } from 'react';
import { useActiveChain } from './useActiveChain';
import { parseContractError } from '../utils/ethereum';
import { formatSolanaActionError } from '../utils/solana';

export type PetError = {
    message: string | null;
    isUserRejection: boolean;
    isContractError: boolean;
};

export function usePetError(
    mutationError: Error | null | undefined,
    receiptError: Error | null | undefined,
    validationError: string | null,
    fallbackMessage: string,
): PetError {
    const chain = useActiveChain();

    return useMemo(() => {
        if (validationError) {
            return { message: validationError, isUserRejection: false, isContractError: false };
        }

        const err = receiptError ?? mutationError;
        if (!err) {
            return { message: null, isUserRejection: false, isContractError: false };
        }

        if (chain.kind === 'solana') {
            return {
                message: formatSolanaActionError(err, fallbackMessage),
                isUserRejection: false,
                isContractError: true,
            };
        }

        const parsed = parseContractError(err);
        return {
            message: parsed.message,
            isUserRejection: parsed.isUserRejection,
            isContractError: parsed.isContractError,
        };
    }, [validationError, mutationError, receiptError, chain.kind, fallbackMessage]);
}
