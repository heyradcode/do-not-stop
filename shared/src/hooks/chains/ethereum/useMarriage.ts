import { useCallback } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { usePetsConfig } from '../../../contexts/PetsConfigContext';

export interface MarriageAction<TArgs> {
    mutateAsync(args: TArgs): Promise<void>;
    isPending: boolean;
    error: Error | null;
    hash?: `0x${string}`;
    reset(): void;
}

type WriteHook = ReturnType<typeof useWriteContract>;

const useAction = <TArgs,>(
    petCore: `0x${string}` | undefined,
    abi: readonly unknown[],
    canWrite: boolean,
    toArgs: (a: TArgs) => readonly unknown[],
    functionName: string,
    w: WriteHook,
    receiptPending: boolean,
): MarriageAction<TArgs> => ({
    async mutateAsync(args) {
        if (!canWrite || !petCore) throw new Error('Marriage is only available on EVM with a connected wallet');
        await w.writeContractAsync({ address: petCore, abi, functionName, args: toArgs(args), gas: 200000n } as unknown as Parameters<typeof w.writeContractAsync>[0]);
    },
    isPending: w.isPending || receiptPending,
    error: (w.error as Error | null),
    hash: w.data,
    reset: w.reset,
});

/**
 * Marriage write actions on PetCore (EVM-only v2.1 feature). Each action has its
 * own isolated tx lifecycle. proposeMarriage/acceptMarriage gate cross-owner
 * breeding (see useBreedPets / requestCreateFromDNA's married branch).
 */
export const useMarriage = () => {
    const { evm } = usePetsConfig();
    const { address } = useAccount();
    const petCore = evm?.petCore.address;
    const abi = evm?.petCore.abi ?? [];
    const canWrite = Boolean(petCore && address);

    const proposeW = useWriteContract();
    const acceptW = useWriteContract();
    const cancelW = useWriteContract();
    const divorceW = useWriteContract();

    const proposeR = useWaitForTransactionReceipt({ hash: proposeW.data, query: { enabled: !!proposeW.data } });
    const acceptR = useWaitForTransactionReceipt({ hash: acceptW.data, query: { enabled: !!acceptW.data } });
    const cancelR = useWaitForTransactionReceipt({ hash: cancelW.data, query: { enabled: !!cancelW.data } });
    const divorceR = useWaitForTransactionReceipt({ hash: divorceW.data, query: { enabled: !!divorceW.data } });

    const propose = useAction<{ petIdA: string; petIdB: string }>(
        petCore, abi, canWrite, (a) => [BigInt(a.petIdA), BigInt(a.petIdB)], 'proposeMarriage', proposeW, proposeR.isLoading);
    const accept = useAction<{ petIdA: string; petIdB: string }>(
        petCore, abi, canWrite, (a) => [BigInt(a.petIdA), BigInt(a.petIdB)], 'acceptMarriage', acceptW, acceptR.isLoading);
    const cancel = useAction<{ petIdA: string }>(
        petCore, abi, canWrite, (a) => [BigInt(a.petIdA)], 'cancelProposal', cancelW, cancelR.isLoading);
    const divorce = useAction<{ petId: string }>(
        petCore, abi, canWrite, (a) => [BigInt(a.petId)], 'divorce', divorceW, divorceR.isLoading);

    const resetAll = useCallback(() => {
        proposeW.reset(); acceptW.reset(); cancelW.reset(); divorceW.reset();
    }, [proposeW, acceptW, cancelW, divorceW]);

    return { propose, accept, cancel, divorce, canWrite, resetAll };
};
