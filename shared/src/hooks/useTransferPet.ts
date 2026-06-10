import { useChainAdapter } from './adapters/useChainAdapter';
import { useTxSuccess } from './useTxSuccess';
import type { PetMutationOptions, PetMutationResult } from './useCreatePet';

export interface TransferPetArgs {
    to: string;
    petId: string;
}

export const useTransferPet = (options?: PetMutationOptions): PetMutationResult<TransferPetArgs>  => {
    const { transferPet } = useChainAdapter();
    useTxSuccess(transferPet.lifecycle, options?.onSuccess);
    return {
        mutate: (args) => transferPet.mutateAsync({ petId: args.petId, to: args.to }),
        isPending: transferPet.isPending,
        error: transferPet.lifecycle.error,
        hash: transferPet.lifecycle.hash,
        reset: transferPet.lifecycle.reset,
        lifecycle: transferPet.lifecycle,
    };
}
