import { useState } from 'react';
import { usePetsContract } from '../ethereum/usePetsContract';
import { usePetActions } from '../solana/usePetActions';
import { usePetsConfig } from '../../contexts/PetsConfigContext';
import { useActiveChain } from './useActiveChain';
import { isActionSupported } from './featureSupport';
import { FeatureNotSupportedError, NoActiveChainError } from './errors';
import type { PetMutationResult } from './useCreatePet';

export interface LevelUpPetArgs {
    petId: string;
}

export function useLevelUpPet(): PetMutationResult<LevelUpPetArgs> {
    const chain = useActiveChain();
    const { evm } = usePetsConfig();
    const isSupported = isActionSupported(chain.kind === 'none' ? null : chain.kind, 'levelUp');

    const evmHook = usePetsContract({
        contractAddress: evm?.contractAddress,
        abi: evm?.abi ?? [],
        enabled: chain.kind === 'evm',
    });
    const solanaActions = usePetActions();

    const [localError, setLocalError] = useState<Error | null>(null);

    const mutate = async (args: LevelUpPetArgs) => {
        if (chain.kind === 'none') throw new NoActiveChainError('levelUp');
        if (!isSupported) throw new FeatureNotSupportedError(chain.kind, 'levelUp');
        try {
            setLocalError(null);
            if (chain.kind === 'evm') {
                evmHook.levelUp(BigInt(args.petId));
                return;
            }
            await solanaActions.levelUpPet.mutateAsync({ petId: Number(args.petId) });
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            setLocalError(error);
            throw error;
        }
    };

    const reset = () => {
        setLocalError(null);
        solanaActions.levelUpPet.reset();
    };

    const isPending =
        chain.kind === 'evm' ? evmHook.isPending : solanaActions.levelUpPet.isPending;
    const error =
        localError ??
        (chain.kind === 'evm'
            ? (evmHook.writeError as Error | null) ?? null
            : (solanaActions.levelUpPet.error as Error | null) ?? null);

    return { isSupported, mutate, isPending, error, reset };
}
