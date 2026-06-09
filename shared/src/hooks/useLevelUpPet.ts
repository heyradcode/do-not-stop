import { useChainAdapter } from './adapters/useChainAdapter';
import type { PetMutationResult } from './useCreatePet';

export interface LevelUpPetArgs {
    petId: string;
}

export function useLevelUpPet(): PetMutationResult<LevelUpPetArgs> {
    const { levelUpPet } = useChainAdapter();
    return {
        mutate: (args) => levelUpPet.mutateAsync({ petId: args.petId }),
        isPending: levelUpPet.isPending,
        error: levelUpPet.lifecycle.error,
        hash: levelUpPet.lifecycle.hash,
        reset: levelUpPet.lifecycle.reset,
    };
}
