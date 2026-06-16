import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { parseEventLogs } from 'viem';
import { useWatchPetsContract } from './chains/ethereum/useWatchPetsContract';
import { useWatchVrfFulfillment } from './chains/ethereum/useWatchVrfFulfillment';
import { usePetsConfig } from '../contexts/PetsConfigContext';
import { useChainAdapter } from './adapters/useChainAdapter';

export interface BreedPetsArgs {
    parentId1: string;
    parentId2: string;
    name: string;
    /** EVM: parents have different owners (married) → adds the stud fee. */
    crossOwner?: boolean;
}

export type UseBreedPetsOptions = {
    onSuccess?: (payload: { name: string }) => void;
};

/**
 * Breed settlement is NOT lifecycle-driven on EVM. The request tx only fires a
 * VRF request; the offspring is minted by a separate, frontend-driven
 * settleBreed tx after the coordinator fulfills randomness (mirrors the Solana
 * reveal+settle flow). Success is then event-driven on `BreedSettled`. On
 * Solana, VRF completes inside the mutation, so success is resolve-driven.
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
        if (!isEvm || !requestReceipt || !hash || !address || !evm?.gameLogic.abi) return;
        try {
            const logs = parseEventLogs({
                abi: evm.gameLogic.abi,
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
    }, [requestReceipt, hash, address, isEvm, evm?.gameLogic.abi]);

    const notifySuccess = useCallback((name: string) => {
        onSuccessRef.current?.({ name });
    }, []);

    // Fire success at most once per breed (the settle receipt and the event
    // watcher can both resolve).
    const successFiredRef = useRef(false);
    const handleBreedFulfilled = useCallback(() => {
        if (successFiredRef.current) return;
        successFiredRef.current = true;
        notifySuccess(offspringNameRef.current);
        setPendingRequestId(null);
    }, [notifySuccess]);

    // VRF coordinator address — read once GameLogic is configured (EVM).
    const { data: coordinator } = useReadContract({
        address: evm?.gameLogic.address,
        abi: evm?.gameLogic.abi ?? [],
        functionName: 's_vrfCoordinator',
        query: { enabled: isEvm && Boolean(evm?.gameLogic.address) },
    });

    // settleBreed tx: sent once the coordinator fulfills our request. The mint
    // (and BreedSettled event) happen inside this tx.
    const settle = useWriteContract();
    const settleSentRef = useRef(false);
    const handleVrfFulfilled = useCallback((id: bigint) => {
        if (settleSentRef.current || !evm?.gameLogic.address) return;
        settleSentRef.current = true;
        settle.writeContract({
            address: evm.gameLogic.address,
            abi: evm.gameLogic.abi,
            functionName: 'settleBreed',
            args: [id],
            gas: 800000n,
        });
    }, [evm?.gameLogic.address, evm?.gameLogic.abi, settle]);

    useWatchVrfFulfillment({
        coordinator: isEvm ? (coordinator as `0x${string}` | undefined) : undefined,
        requestId: isEvm ? pendingRequestId : null,
        onFulfilled: handleVrfFulfilled,
    });

    // Primary, reliable success path: we sent the settleBreed tx, so BreedSettled
    // is in its receipt. Event subscriptions can lag/drop over some RPCs, so
    // confirm success straight from the settle receipt.
    const { isSuccess: settleConfirmed } = useWaitForTransactionReceipt({
        hash: settle.data,
        query: { enabled: !!settle.data },
    });
    useEffect(() => {
        if (isEvm && settleConfirmed) handleBreedFulfilled();
    }, [isEvm, settleConfirmed, handleBreedFulfilled]);

    // Secondary path: watch BreedSettled (covers a settle sent outside this hook).
    useWatchPetsContract({
        contractAddress: evm?.gameLogic.address,
        abi: evm?.gameLogic.abi ?? [],
        address: address as `0x${string}` | undefined,
        pendingRequestId: isEvm ? pendingRequestId : null,
        onBreedSuccess: isEvm ? handleBreedFulfilled : undefined,
    });

    const reset = useCallback(() => {
        setPendingRequestId(null);
        settleSentRef.current = false;
        successFiredRef.current = false;
        settle.reset();
        breedPets.lifecycle.reset();
    }, [settle, breedPets.lifecycle]);

    const clearErrors = useCallback(() => {
        settle.reset();
        breedPets.lifecycle.reset();
    }, [settle, breedPets.lifecycle]);

    const mutate = async (args: BreedPetsArgs) => {
        setPendingRequestId(null);
        settleSentRef.current = false;
        successFiredRef.current = false;
        settle.reset();
        offspringNameRef.current = args.name.trim();
        try {
            await breedPets.mutateAsync({
                parentId1: args.parentId1,
                parentId2: args.parentId2,
                name: args.name.trim(),
                crossOwner: args.crossOwner,
            });
            if (!isEvm) notifySuccess(args.name.trim()); // Solana: confirmed on resolve
        } catch {
            // error tracked in breedPets.lifecycle.error
        }
    };

    return {
        mutate,
        isPending: breedPets.isPending,
        // True for the whole post-request wait: VRF fulfillment + settleBreed,
        // cleared when BreedSettled lands.
        isAwaitingFulfillment: isEvm && pendingRequestId != null,
        isSettling: isEvm && settle.isPending,
        isConfirming: breedPets.lifecycle.phase === 'confirming',
        reset,
        clearErrors,
        hash,
        error: breedPets.lifecycle.error ?? (settle.error as Error | null),
        lifecycle: breedPets.lifecycle,
    };
}
