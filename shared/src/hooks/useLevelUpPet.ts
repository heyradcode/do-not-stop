import { useState } from 'react';
import { usePetsContract } from './chains/ethereum/usePetsContract';
import { usePetActions } from './chains/solana/usePetActions';
import { usePetsConfig } from '../contexts/PetsConfigContext';
import { useActiveChain } from './useActiveChain';
import { NoActiveChainError } from '../utils/pets';
import type { PetMutationResult } from './useCreatePet';

export interface LevelUpPetArgs {
    petId: string;
}

export function useLevelUpPet(): PetMutationResult<LevelUpPetArgs> {
    const chain = useActiveChain();
    const { evm } = usePetsConfig();
    const isEvm = chain.kind === 'evm';

    const evmHook = usePetsContract({
        contractAddress: evm?.contractAddress,
        abi: evm?.abi ?? [],
        enabled: isEvm,
    });
    const solanaActions = usePetActions();

    const [localError, setLocalError] = useState<Error | null>(null);

    const mutate = async (args: LevelUpPetArgs) => {
        if (chain.kind === 'none') throw new NoActiveChainError('levelUp');

        try {
            setLocalError(null);
            if (isEvm) {
                evmHook.levelUp(BigInt(args.petId));
                return;
            }
            await solanaActions.levelUpPet.mutateAsync({ petId: Number(args.petId) });
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            setLocalError(error);
            throw error;
        }
    };

    const reset = () => {
        setLocalError(null);
        solanaActions.levelUpPet.reset();
    };

    const isPending =
        isEvm ? evmHook.isPending : solanaActions.levelUpPet.isPending;

    const error =
        localError ??
        (isEvm
            ? (evmHook.writeError as Error | null) ?? null
            : (solanaActions.levelUpPet.error as Error | null) ?? null);

    const hash =
        isEvm
            ? (evmHook.hash as string | undefined)
            : (solanaActions.levelUpPet.data as string | undefined);

    return { mutate, isPending, error, reset, hash };
}
