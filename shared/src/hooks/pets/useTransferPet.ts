import { useState } from 'react';
import { usePetsContract } from '../ethereum/usePetsContract';
import { usePetsConfig } from '../../contexts/PetsConfigContext';
import { useActiveChain } from './useActiveChain';
import { isActionSupported } from './featureSupport';
import { FeatureNotSupportedError, NoActiveChainError } from './errors';
import type { PetMutationResult } from './useCreatePet';

export interface TransferPetArgs {
    to: string;
    petId: string;
}

export function useTransferPet(): PetMutationResult<TransferPetArgs> {
    const chain = useActiveChain();
    const { evm } = usePetsConfig();
    const isSupported = isActionSupported(chain.kind === 'none' ? null : chain.kind, 'transfer');

    const evmHook = usePetsContract({
        contractAddress: evm?.contractAddress,
        abi: evm?.abi ?? [],
        enabled: chain.kind === 'evm',
    });

    const [localError, setLocalError] = useState<Error | null>(null);

    const mutate = async (args: TransferPetArgs) => {
        if (chain.kind === 'none') throw new NoActiveChainError('transfer');
        if (!isSupported) throw new FeatureNotSupportedError(chain.kind, 'transfer');
        try {
            setLocalError(null);
            evmHook.transferPet(args.to, BigInt(args.petId));
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
