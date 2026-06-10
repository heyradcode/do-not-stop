import { useCallback, useRef, useState } from 'react';
import { useChainAdapter } from './adapters/useChainAdapter';

export interface BattlePetsArgs {
    /** Attacker — must be a pet the caller owns. */
    petId1: string;
    /** Defender — may belong to another player. */
    petId2: string;
    /**
     * Owner of the defender pet. Required for cross-owner Solana battles (used to
     * derive the defender pet PDA). Ignored on EVM, where `petId2` is a global id.
     */
    defenderOwner?: string;
}

export type UseBattlePetsOptions = {
    onSuccess?: () => void;
};

export function useBattlePets(options?: UseBattlePetsOptions) {
    const adapter = useChainAdapter();
    const { battlePets } = adapter;
    const isEvm = adapter.kind === 'evm';

    const onSuccessRef = useRef(options?.onSuccess);
    onSuccessRef.current = options?.onSuccess;

    const [receiptError, setReceiptError] = useState<Error | null>(null);

    const notifySuccess = useCallback(() => { onSuccessRef.current?.(); }, []);

    const mutate = async (args: BattlePetsArgs) => {
        setReceiptError(null);
        try {
            await battlePets.mutateAsync({
                petId1: args.petId1,
                petId2: args.petId2,
                defenderOwner: args.defenderOwner,
            });
            if (!isEvm) notifySuccess(); // Solana: confirmed when mutateAsync resolves
        } catch {
            // error tracked in battlePets.lifecycle.error
        }
    };

    const reset = useCallback(() => {
        setReceiptError(null);
        battlePets.lifecycle.reset();
    }, [battlePets.lifecycle]);

    const clearErrors = useCallback(() => {
        setReceiptError(null);
        battlePets.lifecycle.reset();
    }, [battlePets.lifecycle]);

    const onConfirmed = useCallback(() => {
        notifySuccess();
        reset();
    }, [notifySuccess, reset]);

    const onConfirmError = useCallback((error: Error) => {
        setReceiptError(error);
        battlePets.lifecycle.reset();
    }, [battlePets.lifecycle]);

    return {
        mutate,
        isPending: battlePets.isPending,
        isConfirming: battlePets.lifecycle.phase === 'confirming',
        reset,
        clearErrors,
        hash: battlePets.lifecycle.hash,
        error: battlePets.lifecycle.error,
        receiptError,
        onConfirmed,
        onConfirmError,
    };
}
