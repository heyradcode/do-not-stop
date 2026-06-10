import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount, useWaitForTransactionReceipt } from 'wagmi';
import { parseEventLogs } from 'viem';
import { useWatchPetsContract } from './chains/ethereum/useWatchPetsContract';
import { usePetsConfig } from '../contexts/PetsConfigContext';
import { useChainAdapter } from './adapters/useChainAdapter';

export interface BreedPetsArgs {
    parentId1: string;
    parentId2: string;
    name: string;
}

export type UseBreedPetsOptions = {
    onSuccess?: (payload: { name: string }) => void;
};

/**
 * Breed is the one mutation whose settlement is NOT lifecycle-driven on EVM:
 * the request tx receipt only confirms the VRF request — the offspring exists
 * once the BreedFulfilled event fires. So success here is event-driven on EVM
 * and resolve-driven on Solana (where VRF completes inside the mutation).
 */
export const useBreedPets = (options?: UseBreedPetsOptions) => {
    const adapter = useChainAdapter();
    const { breedPets } = adapter;
    const isEvm = adapter.kind === 'evm';

    const { address } = useAccount();
    const { evm } = usePetsConfig();

    const onSuccessRef = useRef(options?.onSuccess);
    onSuccessRef.current = options?.onSuccess;
    const offspringNameRef = useRef('');

    const [pendingRequestId, setPendingRequestId] = useState<bigint | null>(null);

    const hash = breedPets.lifecycle.hash;

    // Parse the VRF request id from the breed tx receipt (EVM only).
    const { data: requestReceipt } = useWaitForTransactionReceipt({
        hash: isEvm && hash ? (hash as `0x${string}`) : undefined,
    });

    useEffect(() => {
        if (!isEvm || !requestReceipt || !hash || !address || !evm?.abi) return;
        try {
            const logs = parseEventLogs({
                abi: evm.abi,
                logs: requestReceipt.logs,
                eventName: 'BreedRandomnessRequested',
                strict: false,
            }) as unknown as { args: { owner?: string; requestId?: bigint } }[];
            const mine = logs.find((log) => log.args.owner?.toLowerCase() === address.toLowerCase());
            const requestId = mine?.args.requestId;
            if (requestId != null) setPendingRequestId(requestId);
        } catch {
            /* not a breed tx or ABI mismatch */
        }
    }, [requestReceipt, hash, address, isEvm, evm?.abi]);

    const notifySuccess = useCallback((name: string) => {
        onSuccessRef.current?.({ name });
    }, []);

    const handleBreedFulfilled = useCallback(() => {
        notifySuccess(offspringNameRef.current);
        setPendingRequestId(null);
    }, [notifySuccess]);

    // Watch for BreedFulfilled event (EVM VRF fulfillment).
    useWatchPetsContract({
        contractAddress: evm?.contractAddress,
        abi: evm?.abi ?? [],
        address: address as `0x${string}` | undefined,
        pendingRequestId: isEvm ? pendingRequestId : null,
        onBreedSuccess: isEvm ? handleBreedFulfilled : undefined,
    });

    const reset = useCallback(() => {
        setPendingRequestId(null);
        breedPets.lifecycle.reset();
    }, [breedPets.lifecycle]);

    const clearErrors = useCallback(() => {
        breedPets.lifecycle.reset();
    }, [breedPets.lifecycle]);

    const mutate = async (args: BreedPetsArgs) => {
        setPendingRequestId(null);
        offspringNameRef.current = args.name.trim();
        try {
            await breedPets.mutateAsync({
                parentId1: args.parentId1,
                parentId2: args.parentId2,
                name: args.name.trim(),
            });
            if (!isEvm) notifySuccess(args.name.trim()); // Solana: confirmed on resolve
        } catch {
            // error tracked in breedPets.lifecycle.error
        }
    };

    return {
        mutate,
        isPending: breedPets.isPending,
        isAwaitingFulfillment: isEvm && pendingRequestId != null,
        isConfirming: breedPets.lifecycle.phase === 'confirming',
        reset,
        clearErrors,
        hash,
        error: breedPets.lifecycle.error,
        lifecycle: breedPets.lifecycle,
    };
}
