import { useState } from 'react';
import { usePetsContract } from '../ethereum/usePetsContract';
import { usePetsConfig } from '../../contexts/PetsConfigContext';
import { useActiveChain } from './useActiveChain';
import { isActionSupported } from './featureSupport';
import { FeatureNotSupportedError, NoActiveChainError } from './errors';
import type { PetMutationResult } from './useCreatePet';

export interface BreedPetsArgs {
    parentId1: string;
    parentId2: string;
    name: string;
}

export function useBreedPets(): PetMutationResult<BreedPetsArgs> {
    const chain = useActiveChain();
    const { evm } = usePetsConfig();
    const isSupported = isActionSupported(chain.kind === 'none' ? null : chain.kind, 'breed');

    const evmHook = usePetsContract({
        contractAddress: evm?.contractAddress,
        abi: evm?.abi ?? [],
        enabled: chain.kind === 'evm',
    });

    const [localError, setLocalError] = useState<Error | null>(null);

    const mutate = async (args: BreedPetsArgs) => {
        if (chain.kind === 'none') throw new NoActiveChainError('breed');
        if (!isSupported) throw new FeatureNotSupportedError(chain.kind, 'breed');
        try {
            setLocalError(null);
            evmHook.requestBreedFromDNA(BigInt(args.parentId1), BigInt(args.parentId2), args.name);
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            setLocalError(error);
            throw error;
        }
    };

    const reset = () => setLocalError(null);

    const isPending = chain.kind === 'evm' ? evmHook.isPending : false;
    const error = localError ?? (chain.kind === 'evm' ? (evmHook.writeError as Error | null) ?? null : null);

    return { isSupported, mutate, isPending, error, reset };
}
