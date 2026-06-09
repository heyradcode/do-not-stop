import { useChainAdapter } from './adapters/useChainAdapter';
import type { PetMutationResult } from './useCreatePet';

export interface TransferPetArgs {
    to: string;
    petId: string;
}

export function useTransferPet(): PetMutationResult<TransferPetArgs> {
    const { transferPet } = useChainAdapter();
    return {
        mutate: (args) => transferPet.mutateAsync({ petId: args.petId, to: args.to }),
        isPending: transferPet.isPending,
        error: transferPet.lifecycle.error,
        hash: transferPet.lifecycle.hash,
        reset: transferPet.lifecycle.reset,
    };
}
