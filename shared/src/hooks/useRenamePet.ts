import { useChainAdapter } from './adapters/useChainAdapter';
import type { PetMutationResult } from './useCreatePet';

export interface RenamePetArgs {
    petId: string;
    name: string;
}

export function useRenamePet(): PetMutationResult<RenamePetArgs> {
    const { renamePet } = useChainAdapter();
    return {
        mutate: (args) => renamePet.mutateAsync({ petId: args.petId, name: args.name }),
        isPending: renamePet.isPending,
        error: renamePet.lifecycle.error,
        hash: renamePet.lifecycle.hash,
        reset: renamePet.lifecycle.reset,
        lifecycle: renamePet.lifecycle,
    };
}
