import { useState } from 'react';
import { usePetsContract } from './chains/ethereum/usePetsContract';
import { usePetActions } from './chains/solana/usePetActions';
import { usePetsConfig } from '../contexts/PetsConfigContext';
import { useActiveChain } from './useActiveChain';
import { NoActiveChainError } from '../utils/pets';
import type { PetMutationResult } from './useCreatePet';

export interface TransferPetArgs {
    to: string;
    petId: string;
}

export function useTransferPet(): PetMutationResult<TransferPetArgs> {
    const chain = useActiveChain();
    const { evm } = usePetsConfig();
    const isEvm = chain.kind === 'evm';

    const evmHook = usePetsContract({
        contractAddress: evm?.contractAddress,
        abi: evm?.abi ?? [],
        enabled: isEvm,
    });
    const solanaActions = usePetActions();

    const [localError, setLocalError] = useState<Error | null>(null);

    const mutate = async (args: TransferPetArgs) => {
        if (chain.kind === 'none') throw new NoActiveChainError('transfer');

        try {
            setLocalError(null);
            if (isEvm) {
                evmHook.transferPet(args.to, BigInt(args.petId));
                return;
            }
            await solanaActions.transferPet.mutateAsync({
                petId: Number(args.petId),
                to: args.to,
            });
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            setLocalError(error);
            throw error;
        }
    };

    const reset = () => {
        setLocalError(null);
        solanaActions.transferPet.reset();
    };

    const isPending =
        isEvm ? evmHook.isPending : solanaActions.transferPet.isPending;

    const error =
        localError ??
        (isEvm
            ? (evmHook.writeError as Error | null) ?? null
            : (solanaActions.transferPet.error as Error | null) ?? null);

    const hash =
        isEvm
            ? (evmHook.hash as string | undefined)
            : (solanaActions.transferPet.data as string | undefined);

    return { mutate, isPending, error, reset, hash };
}
