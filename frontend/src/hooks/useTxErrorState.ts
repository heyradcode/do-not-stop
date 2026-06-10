import { useCallback, useEffect, useState } from 'react';
import { parseContractError } from '@shared/core';

/**
 * Mirrors wagmi `writeError` into local UI state for transaction panels.
 */
export const useTxErrorState = (writeError: unknown) => {
    const [error, setError] = useState<string | null>(null);
    const [isUserRejection, setIsUserRejection] = useState(false);
    const [isContractError, setIsContractError] = useState(false);

    useEffect(() => {
        if (!writeError) return;
        const parsed = parseContractError(writeError);
        setError(parsed.message);
        setIsUserRejection(parsed.isUserRejection);
        setIsContractError(parsed.isContractError);
    }, [writeError]);

    const resetError = useCallback(() => {
        setError(null);
        setIsUserRejection(false);
        setIsContractError(false);
    }, []);

    return { error, setError, isUserRejection, isContractError, resetError };
}
