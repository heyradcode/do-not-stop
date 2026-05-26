import { useState } from 'react';
import { usePetsContract } from './chains/ethereum/usePetsContract';
import { usePetsConfig } from '../contexts/PetsConfigContext';
import { useActiveChain } from './useActiveChain';
import { isActionSupported, FeatureNotSupportedError, NoActiveChainError } from '../utils/pets';
import type { PetMutationResult } from './useCreatePet';

export interface BattlePetsArgs {
    petId1: string;
    petId2: string;
}

export function useBattlePets(): PetMutationResult<BattlePetsArgs> {
    const chain = useActiveChain();
    const { evm } = usePetsConfig();
    const isSupported = isActionSupported(chain.kind === 'none' ? null : chain.kind, 'battle');

    const evmHook = usePetsContract({
        contractAddress: evm?.contractAddress,
        abi: evm?.abi ?? [],
        enabled: chain.kind === 'evm',
    });

    const [localError, setLocalError] = useState<Error | null>(null);

    const mutate = async (args: BattlePetsArgs) => {
        if (chain.kind === 'none') throw new NoActiveChainError('battle');
        if (!isSupported) throw new FeatureNotSupportedError(chain.kind, 'battle');
        try {
            setLocalError(null);
            evmHook.battlePets(BigInt(args.petId1), BigInt(args.petId2));
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
