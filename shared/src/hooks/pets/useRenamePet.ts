import { useChainAdapter } from '../adapters/useChainAdapter';
import { useTxSuccess } from '../tx/useTxSuccess';
import type { PetMutationOptions, PetMutationResult } from './useCreatePet';

export interface RenamePetArgs {
    petId: string;
    name: string;
}

export const useRenamePet = (options?: PetMutationOptions): PetMutationResult<RenamePetArgs> => {
    const { renamePet } = useChainAdapter();
    useTxSuccess(renamePet.lifecycle, options?.onSuccess);
    return {
        mutate: (args) => renamePet.mutateAsync({ petId: args.petId, name: args.name }),
        isPending: renamePet.isPending,
        error: renamePet.lifecycle.error,
        hash: renamePet.lifecycle.hash,
        reset: renamePet.lifecycle.reset,
        lifecycle: renamePet.lifecycle,
    };
};
