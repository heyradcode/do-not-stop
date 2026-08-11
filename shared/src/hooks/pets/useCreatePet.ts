import { useCallback, useEffect, useRef, useState } from 'react';
import { parseEventLogs } from 'viem';
import { useChainAdapter } from '../adapters/useChainAdapter';
import { useTxSuccess } from '../tx/useTxSuccess';
import { usePetsConfig } from '../../contexts/PetsConfigContext';
import { useEvmEntropySettleFlow } from '../chains/ethereum/useEvmEntropySettleFlow';
import { usePolledContractEvent } from '../chains/ethereum/usePolledContractEvent';
import { EVM_GAS_LIMITS } from '../chains/ethereum/gasLimits';
import type { TxLifecycle } from '../adapters/types';

export interface CreatePetArgs {
    name: string;
}

export interface PetMutationOptions {
    /**
     * Fires once the transaction is fully settled (EVM: MintSettled/BreedSettled confirmed;
     * Solana: mutation resolved). Do NOT check `lifecycle.phase` after
     * `await mutate(...)` instead — that closure reads a stale phase.
     */
    onSuccess?: () => void;
}

export interface PetMutationResult<TArgs> {
    mutate: (args: TArgs) => Promise<void>;
    isPending: boolean;
    error: Error | null;
    reset: () => void;
    /** EVM tx hash (0x…) or Solana signature, once submitted. */
    hash?: string | undefined;
    lifecycle: TxLifecycle;
    /** EVM async mint only: true while waiting for Pyth Entropy fulfillment. */
    isAwaitingFulfillment?: boolean;
    /** EVM async mint only: true while the settleMint tx is in-flight. */
    isSettling?: boolean;
    /**
     * EVM async mint only: the new pet's id, from `MintSettled`, once it lands.
     * Null until then, and on Solana, whose mint surfaces no identifier.
     */
    mintedPetId?: string | null;
}

/**
 * EVM: two-phase flow — requestMintStarter (payable, async) then settleMint once
 * Pyth Entropy reveals. onSuccess fires after MintSettled.
 * Solana: single-tx, success is lifecycle-driven.
 */
export const useCreatePet = (options?: PetMutationOptions): PetMutationResult<CreatePetArgs> => {
    const adapter = useChainAdapter();
    const { createPet } = adapter;
    const isEvm = adapter.kind === 'evm';
    const { evm } = usePetsConfig();

    const onSuccessRef = useRef(options?.onSuccess);
    onSuccessRef.current = options?.onSuccess;

    const [preWriteError, setPreWriteError] = useState<Error | null>(null);
    const hash = createPet.lifecycle.hash;

    // Request id parsing, entropy watch, and the settleMint tx all live in the
    // shared EVM flow; only what settlement *means* stays here.
    const flow = useEvmEntropySettleFlow({
        enabled: isEvm,
        requestHash: hash,
        requestEventName: 'MintRequested',
        settleFunctionName: 'settleMint',
        settleGas: EVM_GAS_LIMITS.settleMint,
        label: 'settleMint',
    });
    const { pendingRequestId } = flow;

    const successFiredRef = useRef(false);
    // MintSettled carries the new pet's id, which is the only way to name the
    // pet that was just minted: DNA is fixed by the reveal, so nothing before
    // settlement identifies it. The caller needs it to show the pet off.
    const [mintedPetId, setMintedPetId] = useState<string | null>(null);
    const handleMintSettled = useCallback((petId?: bigint) => {
        if (successFiredRef.current) return;
        successFiredRef.current = true;
        if (petId != null) setMintedPetId(petId.toString());
        flow.clearPending();
        onSuccessRef.current?.();
    }, [flow]);

    // 4a. Primary: resolve from settle tx receipt (we sent settleMint, so MintSettled is in its logs).
    const { settleReceipt, settleConfirmed } = flow;
    useEffect(() => {
        if (!settleConfirmed) return;
        let petId: bigint | undefined;
        try {
            const logs = parseEventLogs({
                abi: evm?.gameLogic.abi ?? [],
                logs: settleReceipt?.logs ?? [],
                eventName: 'MintSettled',
                strict: false,
            }) as unknown as { args: { petId?: bigint } }[];
            petId = logs[0]?.args.petId;
        } catch { /* settle landed regardless; the id is a bonus, not a gate */ }
        handleMintSettled(petId);
    }, [settleConfirmed, settleReceipt, evm?.gameLogic.abi, handleMintSettled]);

    // 4b. Secondary: watch MintSettled event (covers a settle sent outside this hook).
    usePolledContractEvent({
        address: evm?.gameLogic.address,
        abi: evm?.gameLogic.abi ?? [],
        eventName: 'MintSettled',
        enabled: Boolean(isEvm && evm?.gameLogic.address && pendingRequestId != null),
        chainId: evm?.chainId,
        // A running settle keeper can land MintSettled before this watch arms, in
        // which case reading from the head misses it and the mint never completes.
        fromBlock: flow.requestBlockNumber,
        onLogs(logs) {
            if (pendingRequestId == null) return;
            const typed = logs as unknown as { args: { requestId?: bigint; petId?: bigint } }[];
            const mine = typed.find((l) => l.args.requestId === pendingRequestId);
            if (mine) handleMintSettled(mine.args.petId);
        },
    });

    // Solana: success is lifecycle-driven (single confirmed tx).
    // EVM: pass undefined so useTxSuccess doesn't fire onSuccess after the request tx;
    //      it still calls lifecycle.reset() which is fine (we've already parsed requestId).
    useTxSuccess(createPet.lifecycle, !isEvm ? options?.onSuccess : undefined);

    // Clear this hook's local request/settle bookkeeping. reset() also resets the
    // adapter lifecycle; mutate() doesn't (it's about to drive a fresh one).
    const clearLocalState = useCallback(() => {
        flow.reset();
        setPreWriteError(null);
        setMintedPetId(null);
        successFiredRef.current = false;
    }, [flow]);

    const reset = useCallback(() => {
        clearLocalState();
        createPet.lifecycle.reset();
    }, [clearLocalState, createPet.lifecycle]);

    return {
        mutate: async (args) => {
            clearLocalState();
            try {
                await createPet.mutateAsync({ name: args.name });
            } catch (e) {
                // errors thrown before writeContractAsync (e.g. fee not loaded) aren't
                // captured by the lifecycle — surface them here so the error toast fires.
                if (!createPet.lifecycle.error) setPreWriteError(e as Error);
            }
        },
        isPending: createPet.isPending,
        error: createPet.lifecycle.error ?? preWriteError ?? flow.settleError,
        hash: createPet.lifecycle.hash,
        reset,
        lifecycle: createPet.lifecycle,
        isAwaitingFulfillment: isEvm && pendingRequestId != null,
        isSettling: flow.isSettling,
        mintedPetId,
    };
};
