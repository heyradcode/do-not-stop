import { useState } from 'react';
import { usePetsContract } from './chains/ethereum/usePetsContract';
import { usePetActions } from './chains/solana/usePetActions';
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
    const solanaActions = usePetActions();

    const [localError, setLocalError] = useState<Error | null>(null);

    const mutate = async (args: BattlePetsArgs) => {
        if (chain.kind === 'none') throw new NoActiveChainError('battle');
        if (!isSupported) throw new FeatureNotSupportedError(chain.kind, 'battle');
        try {
            setLocalError(null);
            if (chain.kind === 'evm') {
                evmHook.battlePets(BigInt(args.petId1), BigInt(args.petId2));
                return;
            }
            await solanaActions.battlePets.mutateAsync({
                attackerPetId: Number(args.petId1),
                defenderPetId: Number(args.petId2),
            });
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            setLocalError(error);
            throw error;
        }
    };

    const reset = () => {
        setLocalError(null);
        solanaActions.battlePets.reset();
    };

    const isPending =
        chain.kind === 'evm' ? evmHook.isPending : solanaActions.battlePets.isPending;

    const error =
        localError ??
        (chain.kind === 'evm'
            ? (evmHook.writeError as Error | null) ?? null
            : (solanaActions.battlePets.error as Error | null) ?? null);

    const hash =
        chain.kind === 'evm'
            ? (evmHook.hash as string | undefined)
            : (solanaActions.battlePets.data as string | undefined);

    return { isSupported, mutate, isPending, error, reset, hash };
}
