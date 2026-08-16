import { useCallback } from 'react';
import { useAccount, usePublicClient, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { usePetsConfig } from '../../../contexts/PetsConfigContext';
import { EVM_GAS_LIMITS } from './gasLimits';

export interface MarriageAction<TArgs> {
    mutateAsync(args: TArgs): Promise<void>;
    isPending: boolean;
    error: Error | null;
    hash?: `0x${string}`;
    reset(): void;
}

type WriteHook = ReturnType<typeof useWriteContract>;

/** Settles once the write is mined, or throws if it reverted. See `useMarriage`. */
type ConfirmFn = (hash: `0x${string}`, functionName: string) => Promise<void>;

const useAction = <TArgs,>(
    petCore: `0x${string}` | undefined,
    abi: readonly unknown[],
    canWrite: boolean,
    toArgs: (a: TArgs) => readonly unknown[],
    functionName: string,
    w: WriteHook,
    receiptPending: boolean,
    confirm: ConfirmFn,
): MarriageAction<TArgs> => ({
    async mutateAsync(args) {
        if (!canWrite || !petCore) throw new Error('Marriage is only available on EVM with a connected wallet');
        const hash = await w.writeContractAsync({ address: petCore, abi, functionName, args: toArgs(args), gas: EVM_GAS_LIMITS.marriageAction } as unknown as Parameters<typeof w.writeContractAsync>[0]);
        await confirm(hash, functionName);
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
 *
 * Every action resolves when its transaction is **mined**, not when it is submitted.
 * `writeContractAsync` returns as soon as the wallet hands back a hash, and callers treat
 * that resolution as "done": they show a success message and invalidate the contract read
 * caches. Doing that against a transaction still in the mempool re-reads pre-confirmation
 * state, caches it, and nothing invalidates again when the receipt lands — so a marriage
 * that succeeded on chain stayed invisible until the screen remounted. It presented as
 * intermittent because it is a race with block time.
 *
 * A reverted transaction throws for the same reason: it is mined, so waiting alone would
 * report it as success. That is how an `acceptMarriage` that reverted with "Proposal
 * expired" still produced "Marriage accepted!".
 */
export const useMarriage = () => {
    const { evm } = usePetsConfig();
    const { address } = useAccount();
    const publicClient = usePublicClient({ chainId: evm?.chainId });
    const petCore = evm?.petCore.address;
    const abi = evm?.petCore.abi ?? [];
    const canWrite = Boolean(petCore && address);

    const confirm = useCallback<ConfirmFn>(
        async (hash, functionName) => {
            // No client configured for this chain: nothing to wait on, so behave as before
            // rather than failing a write that was actually sent.
            if (!publicClient) return;
            const receipt = await publicClient.waitForTransactionReceipt({ hash });
            if (receipt.status === 'reverted') {
                // The reason is not in the receipt, and recovering it means re-simulating
                // at the failed block. Saying plainly that nothing changed is what stops a
                // false success; the caller surfaces this message.
                throw new Error(`${functionName} was mined but reverted, so nothing changed.`);
            }
        },
        [publicClient],
    );

    const proposeW = useWriteContract();
    const acceptW = useWriteContract();
    const cancelW = useWriteContract();
    const divorceW = useWriteContract();

    const proposeR = useWaitForTransactionReceipt({ hash: proposeW.data, query: { enabled: !!proposeW.data } });
    const acceptR = useWaitForTransactionReceipt({ hash: acceptW.data, query: { enabled: !!acceptW.data } });
    const cancelR = useWaitForTransactionReceipt({ hash: cancelW.data, query: { enabled: !!cancelW.data } });
    const divorceR = useWaitForTransactionReceipt({ hash: divorceW.data, query: { enabled: !!divorceW.data } });

    const propose = useAction<{ petIdA: string; petIdB: string }>(
        petCore, abi, canWrite, (a) => [BigInt(a.petIdA), BigInt(a.petIdB)], 'proposeMarriage', proposeW, proposeR.isLoading, confirm);
    const accept = useAction<{ petIdA: string; petIdB: string }>(
        petCore, abi, canWrite, (a) => [BigInt(a.petIdA), BigInt(a.petIdB)], 'acceptMarriage', acceptW, acceptR.isLoading, confirm);
    const cancel = useAction<{ petIdA: string }>(
        petCore, abi, canWrite, (a) => [BigInt(a.petIdA)], 'cancelProposal', cancelW, cancelR.isLoading, confirm);
    const divorce = useAction<{ petId: string }>(
        petCore, abi, canWrite, (a) => [BigInt(a.petId)], 'divorce', divorceW, divorceR.isLoading, confirm);

    const resetAll = useCallback(() => {
        proposeW.reset(); acceptW.reset(); cancelW.reset(); divorceW.reset();
    }, [proposeW, acceptW, cancelW, divorceW]);

    return { propose, accept, cancel, divorce, canWrite, resetAll };
};
