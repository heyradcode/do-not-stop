import { useState } from 'react';
import { usePetsContract } from './chains/ethereum/usePetsContract';
import { usePetActions } from './chains/solana/usePetActions';
import { usePetsConfig } from '../contexts/PetsConfigContext';
import { useActiveChain } from './useActiveChain';
import { isActionSupported, FeatureNotSupportedError, NoActiveChainError } from '../utils/pets';
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
    const solanaActions = usePetActions();

    const [localError, setLocalError] = useState<Error | null>(null);

    const mutate = async (args: BreedPetsArgs) => {
        if (chain.kind === 'none') throw new NoActiveChainError('breed');
        if (!isSupported) throw new FeatureNotSupportedError(chain.kind, 'breed');
        try {
            setLocalError(null);
            if (chain.kind === 'evm') {
                evmHook.requestBreedFromDNA(
                    BigInt(args.parentId1),
                    BigInt(args.parentId2),
                    args.name
                );
                return;
            }
            await solanaActions.breedPets.mutateAsync({
                parent1Id: Number(args.parentId1),
                parent2Id: Number(args.parentId2),
                name: args.name,
            });
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            setLocalError(error);
            throw error;
        }
    };

    const reset = () => {
        setLocalError(null);
        solanaActions.breedPets.reset();
    };

    const isPending =
        chain.kind === 'evm' ? evmHook.isPending : solanaActions.breedPets.isPending;

    const error =
        localError ??
        (chain.kind === 'evm'
            ? (evmHook.writeError as Error | null) ?? null
            : (solanaActions.breedPets.error as Error | null) ?? null);

    const hash =
        chain.kind === 'evm'
            ? (evmHook.hash as string | undefined)
            : (solanaActions.breedPets.data as string | undefined);

    return { isSupported, mutate, isPending, error, reset, hash };
}
