import { useMemo } from 'react';
import { useChainCapabilities } from './useChainCapabilities';

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
    const { parseError } = useChainCapabilities();

    return useMemo(() => {
        if (validationError) {
            return { message: validationError, isUserRejection: false, isContractError: false };
        }

        const err = receiptError ?? mutationError;
        if (!err) {
            return { message: null, isUserRejection: false, isContractError: false };
        }

        return parseError(err, fallbackMessage);
    }, [validationError, mutationError, receiptError, parseError, fallbackMessage]);
}
