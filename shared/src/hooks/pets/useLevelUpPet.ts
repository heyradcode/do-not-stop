import { useChainAdapter } from '../adapters/useChainAdapter';
import { useTxSuccess } from '../tx/useTxSuccess';
import type { PetMutationOptions, PetMutationResult } from './useCreatePet';

export interface LevelUpPetArgs {
    petId: string;
}

export const useLevelUpPet = (options?: PetMutationOptions): PetMutationResult<LevelUpPetArgs> => {
    const { levelUpPet } = useChainAdapter();
    useTxSuccess(levelUpPet.lifecycle, options?.onSuccess);
    return {
        mutate: (args) => levelUpPet.mutateAsync({ petId: args.petId }),
        isPending: levelUpPet.isPending,
        error: levelUpPet.lifecycle.error,
        hash: levelUpPet.lifecycle.hash,
        reset: levelUpPet.lifecycle.reset,
        lifecycle: levelUpPet.lifecycle,
    };
};
