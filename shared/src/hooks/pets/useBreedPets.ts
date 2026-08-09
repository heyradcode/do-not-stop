import { useCallback, useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import { useWatchPetsContract } from '../chains/ethereum/useWatchPetsContract';
import { useEvmEntropySettleFlow } from '../chains/ethereum/useEvmEntropySettleFlow';
import { usePetsConfig } from '../../contexts/PetsConfigContext';
import { useChainAdapter } from '../adapters/useChainAdapter';
import { EVM_GAS_LIMITS } from '../chains/ethereum/gasLimits';

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

    const hash = breedPets.lifecycle.hash;

    // Request id parsing, entropy watch, and the settleBreed tx all live in the
    // shared EVM flow; only what settlement *means* stays here.
    const flow = useEvmEntropySettleFlow({
        enabled: isEvm,
        requestHash: hash,
        requestEventName: 'BreedRandomnessRequested',
        settleFunctionName: 'settleBreed',
        settleGas: EVM_GAS_LIMITS.settleBreed,
        label: 'settleBreed',
    });
    const { pendingRequestId } = flow;

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
        flow.clearPending();
    }, [notifySuccess, flow]);

    // Primary, reliable success path: we sent the settleBreed tx, so BreedSettled
    // is in its receipt. Event subscriptions can lag/drop over some RPCs, so
    // confirm success straight from the settle receipt.
    useEffect(() => {
        if (flow.settleConfirmed) handleBreedFulfilled();
    }, [flow.settleConfirmed, handleBreedFulfilled]);

    // Secondary path: watch BreedSettled (covers a settle sent outside this hook).
    useWatchPetsContract({
        contractAddress: evm?.gameLogic.address,
        abi: evm?.gameLogic.abi ?? [],
        address: address as `0x${string}` | undefined,
        pendingRequestId: isEvm ? pendingRequestId : null,
        onBreedSuccess: isEvm ? handleBreedFulfilled : undefined,
    });

    const reset = useCallback(() => {
        flow.reset();
        successFiredRef.current = false;
        breedPets.lifecycle.reset();
    }, [flow, breedPets.lifecycle]);

    // Dismiss the error without abandoning the breed: the request is still pending
    // on chain and settleBreed stays retryable.
    const clearErrors = useCallback(() => {
        flow.clearSettleError();
        breedPets.lifecycle.reset();
    }, [flow, breedPets.lifecycle]);

    const mutate = async (args: BreedPetsArgs) => {
        flow.reset();
        successFiredRef.current = false;
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
        isSettling: flow.isSettling,
        isConfirming: breedPets.lifecycle.phase === 'confirming',
        reset,
        clearErrors,
        hash,
        error: breedPets.lifecycle.error ?? flow.settleError,
        lifecycle: breedPets.lifecycle,
    };
};
