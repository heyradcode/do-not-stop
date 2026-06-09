import { useState } from 'react';
import { usePetsContract } from './chains/ethereum/usePetsContract';
import { usePetActions } from './chains/solana/usePetActions';
import { usePetsConfig } from '../contexts/PetsConfigContext';
import { useActiveChain } from './useActiveChain';
import { NoActiveChainError } from '../utils/pets';
import type { PetMutationResult } from './useCreatePet';

export interface RenamePetArgs {
    petId: string;
    name: string;
}

export function useRenamePet(): PetMutationResult<RenamePetArgs> {
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

    const mutate = async (args: RenamePetArgs) => {
        if (chain.kind === 'none') throw new NoActiveChainError('rename');

        try {
            setLocalError(null);
            if (isEvm) {
                evmHook.changeName(BigInt(args.petId), args.name);
                return;
            }
            await solanaActions.renamePet.mutateAsync({
                petId: Number(args.petId),
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
        solanaActions.renamePet.reset();
    };

    const isPending =
        isEvm ? evmHook.isPending : solanaActions.renamePet.isPending;
    const error =
        localError ??
        (isEvm
            ? (evmHook.writeError as Error | null) ?? null
            : (solanaActions.renamePet.error as Error | null) ?? null);

    const hash =
        isEvm
            ? (evmHook.hash as string | undefined)
            : (solanaActions.renamePet.data as string | undefined);

    return { mutate, isPending, error, reset, hash };
}
