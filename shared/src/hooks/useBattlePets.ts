import { useCallback, useRef, useState } from 'react';
import { usePetsContract } from './chains/ethereum/usePetsContract';
import { usePetActions } from './chains/solana/usePetActions';
import { usePetsConfig } from '../contexts/PetsConfigContext';
import { useActiveChain } from './useActiveChain';
import { isActionSupported, FeatureNotSupportedError, NoActiveChainError } from '../utils/pets';

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
    const [receiptError, setReceiptError] = useState<Error | null>(null);

    const mutationError =
        localError ??
        (chain.kind === 'evm'
            ? (evmHook.writeError as Error | null) ?? null
            : (solanaActions.battlePets.error as Error | null) ?? null);

    const hash =
        chain.kind === 'evm'
            ? (evmHook.hash as string | undefined)
            : (solanaActions.battlePets.data as string | undefined);

    const isPending =
        chain.kind === 'evm' ? evmHook.isPending : solanaActions.battlePets.isPending;

    const tracksEvmReceipt = chain.kind === 'evm';

    const reset = useCallback(() => {
        setLocalError(null);
        setReceiptError(null);
        solanaActions.battlePets.reset();
    }, [solanaActions.battlePets]);

    const clearErrors = useCallback(() => {
        setLocalError(null);
        setReceiptError(null);
        solanaActions.battlePets.reset();
    }, [solanaActions.battlePets]);

    const notifySuccess = useCallback(() => {
        onSuccessRef.current?.();
    }, []);

    const mutate = async (args: BattlePetsArgs) => {
        if (chain.kind === 'none') throw new NoActiveChainError('battle');
        if (!isSupported) throw new FeatureNotSupportedError(chain.kind, 'battle');

        setLocalError(null);
        setReceiptError(null);

        try {
            if (chain.kind === 'evm') {
                evmHook.battlePets(BigInt(args.petId1), BigInt(args.petId2));
                return;
            }
            await solanaActions.battlePets.mutateAsync({
                attackerPetId: Number(args.petId1),
                defenderPetId: Number(args.petId2),
                ...(args.defenderOwner ? { defenderOwner: args.defenderOwner } : {}),
            });
            notifySuccess();
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            setLocalError(error);
        }
    };

    const onEvmReceiptComplete = useCallback(() => {
        notifySuccess();
        reset();
    }, [notifySuccess, reset]);

    const onEvmReceiptError = useCallback((error: Error) => {
        setReceiptError(error);
    }, []);

    return {
        isSupported,
        mutate,
        isPending,
        reset,
        clearErrors,
        hash,
        error: mutationError,
        receiptError,
        tracksEvmReceipt,
        onEvmReceiptComplete,
        onEvmReceiptError,
    };
}
