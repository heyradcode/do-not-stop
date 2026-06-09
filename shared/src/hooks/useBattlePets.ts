import { useCallback, useRef, useState } from 'react';
import { usePetsContract } from './chains/ethereum/usePetsContract';
import { usePetActions } from './chains/solana/usePetActions';
import { usePetsConfig } from '../contexts/PetsConfigContext';
import { useActiveChain } from './useActiveChain';
import { NoActiveChainError } from '../utils/pets';

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
    const isEvm = chain.kind === 'evm';

    const evmHook = usePetsContract({
        contractAddress: evm?.contractAddress,
        abi: evm?.abi ?? [],
        enabled: isEvm,
    });
    const solanaActions = usePetActions();

    const onSuccessRef = useRef(options?.onSuccess);
    onSuccessRef.current = options?.onSuccess;

    const [localError, setLocalError] = useState<Error | null>(null);
    const [receiptError, setReceiptError] = useState<Error | null>(null);

    const mutationError =
        localError ??
        (isEvm
            ? (evmHook.writeError as Error | null) ?? null
            : (solanaActions.battlePets.error as Error | null) ?? null);

    const hash =
        isEvm
            ? (evmHook.hash as string | undefined)
            : (solanaActions.battlePets.data as string | undefined);

    const isPending =
        isEvm ? evmHook.isPending : solanaActions.battlePets.isPending;

    const tracksEvmReceipt = isEvm;

    // True while an EVM tx is submitted and waiting for on-chain confirmation
    // (wallet is approved but block not yet mined).
    const isEvmConfirming = isEvm && !!evmHook.hash && !evmHook.isPending;

    const reset = useCallback(() => {
        setLocalError(null);
        setReceiptError(null);
        solanaActions.battlePets.reset();
        evmHook.resetWrite();
    }, [solanaActions.battlePets, evmHook.resetWrite]);

    const clearErrors = useCallback(() => {
        setLocalError(null);
        setReceiptError(null);
        solanaActions.battlePets.reset();
        evmHook.resetWrite();
    }, [solanaActions.battlePets, evmHook.resetWrite]);

    const notifySuccess = useCallback(() => {
        onSuccessRef.current?.();
    }, []);

    const mutate = async (args: BattlePetsArgs) => {
        if (chain.kind === 'none') throw new NoActiveChainError('battle');

        setLocalError(null);
        setReceiptError(null);

        try {
            if (isEvm) {
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
        evmHook.resetWrite();
    }, [evmHook.resetWrite]);

    return {
        mutate,
        isPending,
        isEvmConfirming,
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
