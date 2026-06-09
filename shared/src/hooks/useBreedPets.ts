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

export function useBreedPets(options?: UseBreedPetsOptions) {
    const adapter = useChainAdapter();
    const { breedPets } = adapter;
    const isEvm = adapter.kind === 'evm';

    const { address } = useAccount();
    const { evm } = usePetsConfig();

    const onSuccessRef = useRef(options?.onSuccess);
    onSuccessRef.current = options?.onSuccess;
    const offspringNameRef = useRef('');

    const [receiptError, setReceiptError] = useState<Error | null>(null);
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
        setReceiptError(null);
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
        setReceiptError(null);
        setPendingRequestId(null);
        breedPets.lifecycle.reset();
    }, [breedPets.lifecycle]);

    const clearErrors = useCallback(() => {
        setReceiptError(null);
        breedPets.lifecycle.reset();
    }, [breedPets.lifecycle]);

    const mutate = async (args: BreedPetsArgs) => {
        setReceiptError(null);
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

    const onEvmReceiptComplete = useCallback(() => {
        /* VRF fulfillment is handled via BreedFulfilled event, not request-tx confirm */
    }, []);

    const onEvmReceiptError = useCallback((error: Error) => {
        setReceiptError(error);
    }, []);

    return {
        mutate,
        isPending: breedPets.isPending,
        isAwaitingFulfillment: isEvm && pendingRequestId != null,
        reset,
        clearErrors,
        hash,
        error: breedPets.lifecycle.error,
        receiptError,
        tracksEvmReceipt: isEvm,
        onEvmReceiptComplete,
        onEvmReceiptError,
    };
}
