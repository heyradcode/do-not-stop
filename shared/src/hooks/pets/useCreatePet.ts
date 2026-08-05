import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { parseEventLogs } from 'viem';
import { useChainAdapter } from '../adapters/useChainAdapter';
import { useTxSuccess } from '../tx/useTxSuccess';
import { usePetsConfig } from '../../contexts/PetsConfigContext';
import { useWatchEntropyFulfillment } from '../chains/ethereum/useWatchEntropyFulfillment';
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
    const { address } = useAccount();

    const onSuccessRef = useRef(options?.onSuccess);
    onSuccessRef.current = options?.onSuccess;

    const [pendingRequestId, setPendingRequestId] = useState<bigint | null>(null);
    const [preWriteError, setPreWriteError] = useState<Error | null>(null);
    const hash = createPet.lifecycle.hash;

    // 1. Parse MintRequested requestId from the request tx receipt (EVM only).
    const { data: requestReceipt } = useWaitForTransactionReceipt({
        hash: isEvm && hash ? (hash as `0x${string}`) : undefined,
    });
    useEffect(() => {
        if (!isEvm || !requestReceipt || !address || !evm?.gameLogic.abi) return;
        try {
            const logs = parseEventLogs({
                abi: evm.gameLogic.abi,
                logs: requestReceipt.logs,
                eventName: 'MintRequested',
                strict: false,
            }) as unknown as { args: { owner?: string; requestId?: bigint } }[];
            const mine = logs.find((l) => l.args.owner?.toLowerCase() === address.toLowerCase());
            if (mine?.args.requestId != null) setPendingRequestId(mine.args.requestId);
        } catch { /* not a mint tx / ABI mismatch */ }
    }, [isEvm, requestReceipt, address, evm?.gameLogic.abi]);

    // Read the Pyth Entropy contract address from GameLogic (needed for the Revealed watcher).
    const { data: entropyAddress } = useReadContract({
        address: evm?.gameLogic.address,
        abi: evm?.gameLogic.abi ?? [],
        functionName: 'entropy',
        chainId: evm?.chainId,
        query: { enabled: isEvm && Boolean(evm?.gameLogic.address) },
    });

    // 3. settleMint tx — fired once Entropy reveals.
    const settle = useWriteContract();
    const settleSentRef = useRef(false);
    const handleEntropyFulfilled = useCallback((id: bigint) => {
        if (settleSentRef.current || !evm?.gameLogic.address) return;
        settleSentRef.current = true;
        settle.writeContract(
            { address: evm.gameLogic.address, abi: evm.gameLogic.abi, functionName: 'settleMint', args: [id], gas: EVM_GAS_LIMITS.settleMint, chainId: evm.chainId },
            {
                onError: (e) => {
                    // Re-arm. The flag exists to stop one reveal sending two settles,
                    // not to make a rejected or reverted settle permanent: settleMint
                    // is permissionless and retryable by design, and the request stays
                    // pending on chain until it lands. Leaving it set stranded the
                    // flow with the mint fee already spent and no way to finish it.
                    settleSentRef.current = false;
                    console.error('[settleMint]', e);
                },
            },
        );
    }, [evm?.gameLogic.address, evm?.gameLogic.abi, evm?.chainId, settle]);

    // 2. Watch Pyth Entropy `Revealed` (caller = gameLogic, sequenceNumber = requestId).
    useWatchEntropyFulfillment({
        entropyAddress: isEvm ? (entropyAddress as `0x${string}` | undefined) : undefined,
        gameLogicAddress: isEvm ? evm?.gameLogic.address : undefined,
        requestId: isEvm ? pendingRequestId : null,
        onFulfilled: handleEntropyFulfilled,
    });

    const successFiredRef = useRef(false);
    // MintSettled carries the new pet's id, which is the only way to name the
    // pet that was just minted: DNA is fixed by the reveal, so nothing before
    // settlement identifies it. The caller needs it to show the pet off.
    const [mintedPetId, setMintedPetId] = useState<string | null>(null);
    const handleMintSettled = useCallback((petId?: bigint) => {
        if (successFiredRef.current) return;
        successFiredRef.current = true;
        if (petId != null) setMintedPetId(petId.toString());
        setPendingRequestId(null);
        onSuccessRef.current?.();
    }, []);

    // 4a. Primary: resolve from settle tx receipt (we sent settleMint, so MintSettled is in its logs).
    const { data: settleReceipt, isSuccess: settleConfirmed } = useWaitForTransactionReceipt({
        hash: settle.data,
        query: { enabled: !!settle.data },
    });
    useEffect(() => {
        if (!isEvm || !settleConfirmed) return;
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
    }, [isEvm, settleConfirmed, settleReceipt, evm?.gameLogic.abi, handleMintSettled]);

    // 4b. Secondary: watch MintSettled event (covers a settle sent outside this hook).
    usePolledContractEvent({
        address: evm?.gameLogic.address,
        abi: evm?.gameLogic.abi ?? [],
        eventName: 'MintSettled',
        enabled: Boolean(isEvm && evm?.gameLogic.address && pendingRequestId != null),
        chainId: evm?.chainId,
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
        setPendingRequestId(null);
        setPreWriteError(null);
        setMintedPetId(null);
        settleSentRef.current = false;
        successFiredRef.current = false;
        settle.reset();
    }, [settle]);

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
        error: createPet.lifecycle.error ?? preWriteError ?? (settle.error as Error | null),
        hash: createPet.lifecycle.hash,
        reset,
        lifecycle: createPet.lifecycle,
        isAwaitingFulfillment: isEvm && pendingRequestId != null,
        isSettling: isEvm && settle.isPending,
        mintedPetId,
    };
};
