import { useCallback, useMemo, useRef, useState } from 'react';
import { usePetsContract } from './chains/ethereum/usePetsContract';
import { usePetActions } from './chains/solana/usePetActions';
import { usePetsConfig } from '../contexts/PetsConfigContext';
import { useActiveChain } from './useActiveChain';
import { isActionSupported, FeatureNotSupportedError, NoActiveChainError } from '../utils/pets';
import { parseContractError } from '../utils/ethereum/errorParser';
import { formatSolanaActionError } from '../utils/solana/parseSolanaTransactionError';

export interface BattlePetsArgs {
    petId1: string;
    petId2: string;
}

export type BattlePetsErrorDisplay = {
    message: string | null;
    isUserRejection: boolean;
    isContractError: boolean;
};

/** Props for the frontend `TransactionStatus` component (EVM receipt tracking). */
export type BattlePetsTransactionTracker = {
    hash: string | undefined;
    onComplete: () => void;
    onError: (error: Error) => void;
};

export type UseBattlePetsOptions = {
    onSuccess?: () => void;
};

const BATTLE_FAIL_MESSAGE = 'Failed to start battle. Please try again.';
const VALIDATION_MESSAGE = 'Please select two pets to battle';

export function useBattlePets(options?: UseBattlePetsOptions) {
    const chain = useActiveChain();
    const { evm } = usePetsConfig();
    const isSupported = isActionSupported(chain.kind === 'none' ? null : chain.kind, 'battle');

    const evmHook = usePetsContract({
        contractAddress: evm?.contractAddress,
        abi: evm?.abi ?? [],
        enabled: chain.kind === 'evm',
    });
    const solanaActions = usePetActions();

    const onSuccessRef = useRef(options?.onSuccess);
    onSuccessRef.current = options?.onSuccess;

    const [localError, setLocalError] = useState<Error | null>(null);
    const [validationError, setValidationError] = useState<string | null>(null);
    const [manualError, setManualError] = useState<BattlePetsErrorDisplay | null>(null);

    const mutationError =
        localError ??
        (chain.kind === 'evm'
            ? (evmHook.writeError as Error | null) ?? null
            : (solanaActions.battlePets.error as Error | null) ?? null);

    const parsedMutationError = useMemo((): BattlePetsErrorDisplay | null => {
        if (!mutationError) return null;
        if (chain.kind === 'solana') {
            return {
                message: formatSolanaActionError(mutationError, BATTLE_FAIL_MESSAGE),
                isUserRejection: false,
                isContractError: true,
            };
        }
        const parsed = parseContractError(mutationError);
        return {
            message: parsed.message,
            isUserRejection: parsed.isUserRejection,
            isContractError: parsed.isContractError,
        };
    }, [chain.kind, mutationError]);

    const error: BattlePetsErrorDisplay = manualError ??
        (validationError
            ? { message: validationError, isUserRejection: false, isContractError: false }
            : parsedMutationError ?? { message: null, isUserRejection: false, isContractError: false });

    const hash =
        chain.kind === 'evm'
            ? (evmHook.hash as string | undefined)
            : (solanaActions.battlePets.data as string | undefined);

    const subtitle =
        chain.kind === 'solana'
            ? 'Select two pets to battle (Switchboard VRF)'
            : 'Select two pets to battle';

    const pendingLabel = chain.kind === 'solana' ? 'Generating randomness…' : 'Starting Battle...';

    const isPending =
        chain.kind === 'evm' ? evmHook.isPending : solanaActions.battlePets.isPending;

    const reset = useCallback(() => {
        setLocalError(null);
        setValidationError(null);
        setManualError(null);
        solanaActions.battlePets.reset();
    }, [solanaActions.battlePets]);

    const clearErrors = useCallback(() => {
        setValidationError(null);
        setManualError(null);
        setLocalError(null);
        solanaActions.battlePets.reset();
    }, [solanaActions.battlePets]);

    const notifySuccess = useCallback(() => {
        onSuccessRef.current?.();
    }, []);

    const mutate = async (args: BattlePetsArgs) => {
        if (chain.kind === 'none') throw new NoActiveChainError('battle');
        if (!isSupported) throw new FeatureNotSupportedError(chain.kind, 'battle');

        setValidationError(null);
        setManualError(null);
        setLocalError(null);

        if (!args.petId1 || !args.petId2) {
            setValidationError(VALIDATION_MESSAGE);
            return;
        }

        try {
            if (chain.kind === 'evm') {
                evmHook.battlePets(BigInt(args.petId1), BigInt(args.petId2));
                return;
            }
            await solanaActions.battlePets.mutateAsync({
                attackerPetId: Number(args.petId1),
                defenderPetId: Number(args.petId2),
            });
            notifySuccess();
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            setLocalError(error);
        }
    };

    const handleReceiptComplete = useCallback(() => {
        notifySuccess();
        reset();
    }, [notifySuccess, reset]);

    const handleReceiptError = useCallback((receiptError: Error) => {
        const parsed = parseContractError(receiptError);
        setManualError({
            message: parsed.message,
            isUserRejection: parsed.isUserRejection,
            isContractError: parsed.isContractError,
        });
    }, []);

    const transactionTracker: BattlePetsTransactionTracker | null =
        chain.kind === 'evm'
            ? {
                  hash,
                  onComplete: handleReceiptComplete,
                  onError: handleReceiptError,
              }
            : null;

    const hashHint = chain.kind === 'solana' && hash ? `${hash.slice(0, 8)}…` : null;

    return {
        isSupported,
        mutate,
        isPending,
        reset,
        clearErrors,
        hash,
        hashHint,
        subtitle,
        pendingLabel,
        submitLabel: 'Start Battle',
        error,
        transactionTracker,
    };
}
