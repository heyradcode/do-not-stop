import { useMemo } from 'react';
import { useActiveChain, parseContractError, formatSolanaActionError } from '@shared/core';

export type PetActionErrorDisplay = {
    message: string | null;
    isUserRejection: boolean;
    isContractError: boolean;
};

export function usePetActionErrorDisplay(
    mutationError: Error | null | undefined,
    receiptError: Error | null | undefined,
    validationError: string | null,
    solanaFailMessage: string,
): PetActionErrorDisplay {
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
                message: formatSolanaActionError(err, solanaFailMessage),
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
    }, [validationError, mutationError, receiptError, chain.kind, solanaFailMessage]);
}

export function formatTxHashHint(hash: string | undefined): string | null {
    return hash ? `${hash.slice(0, 8)}…` : null;
}
