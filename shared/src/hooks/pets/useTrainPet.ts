import { useChainAdapter } from '../adapters/useChainAdapter';
import { useTxSuccess } from '../tx/useTxSuccess';
import type { PetMutationOptions, PetMutationResult } from './useCreatePet';

export interface TrainPetArgs {
    petId: string;
}

/** v2 train: pay a level-scaled fee for a flat XP grant. Settlement is lifecycle-driven. */
export const useTrainPet = (options?: PetMutationOptions): PetMutationResult<TrainPetArgs> => {
    const { trainPet } = useChainAdapter();
    useTxSuccess(trainPet.lifecycle, options?.onSuccess);
    return {
        mutate: (args) => trainPet.mutateAsync({ petId: args.petId }),
        isPending: trainPet.isPending,
        error: trainPet.lifecycle.error,
        hash: trainPet.lifecycle.hash,
        reset: trainPet.lifecycle.reset,
        lifecycle: trainPet.lifecycle,
    };
};
