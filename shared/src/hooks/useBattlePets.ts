import { useCallback, useRef } from 'react';
import { useChainAdapter } from './adapters/useChainAdapter';
import { useTxSuccess } from './useTxSuccess';

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
    /** Fires once the battle is settled on-chain (EVM: receipt; Solana: confirm). */
    onSuccess?: () => void;
};

export const useBattlePets = (options?: UseBattlePetsOptions) => {
    const { battlePets } = useChainAdapter();

    const onSuccessRef = useRef(options?.onSuccess);
    onSuccessRef.current = options?.onSuccess;

    const notifySuccess = useCallback(() => { onSuccessRef.current?.(); }, []);

    // Settlement is lifecycle-driven on both chains: EVM reaches `success` when
    // the receipt lands, Solana when the mutation resolves confirmed.
    useTxSuccess(battlePets.lifecycle, notifySuccess);

    const mutate = async (args: BattlePetsArgs) => {
        try {
            await battlePets.mutateAsync({
                petId1: args.petId1,
                petId2: args.petId2,
                defenderOwner: args.defenderOwner,
            });
        } catch {
            // error tracked in battlePets.lifecycle.error
        }
    };

    const reset = useCallback(() => {
        battlePets.lifecycle.reset();
    }, [battlePets.lifecycle]);

    return {
        mutate,
        isPending: battlePets.isPending,
        isConfirming: battlePets.lifecycle.phase === 'confirming',
        reset,
        clearErrors: reset,
        hash: battlePets.lifecycle.hash,
        error: battlePets.lifecycle.error,
        lifecycle: battlePets.lifecycle,
    };
}
