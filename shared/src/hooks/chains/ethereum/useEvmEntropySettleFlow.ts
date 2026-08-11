import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { parseEventLogs, type TransactionReceipt } from 'viem';

import { usePetsConfig } from '../../../contexts/PetsConfigContext';
import { useWatchEntropyFulfillment } from './useWatchEntropyFulfillment';

/**
 * The EVM half of a Pyth Entropy two-phase action: request lands, entropy reveals,
 * a permissionless settle tx finishes it.
 *
 * `useCreatePet` (requestMintStarter/settleMint) and `useBreedPets`
 * (requestBreed/settleBreed) ran identical copies of this. Identical except for one
 * thing, which is the reason it lives here now: only the mint copy re-armed its
 * "already sent" guard when the settle failed, so a rejected settleBreed stranded the
 * breed with both fees spent and no way to finish it. One implementation means that
 * cannot drift apart again.
 *
 * Deliberately stops at "the settle tx confirmed". What settlement *means* differs per
 * caller (the mint parses a petId out of `MintSettled`, the breed only needs to know it
 * happened) and each also runs its own secondary watcher for a settle sent elsewhere, so
 * firing success stays with the caller.
 */
export interface EvmEntropySettleFlowOptions {
    /** False off EVM. Every read, watch, and effect below is inert when false. */
    enabled: boolean;
    /** Hash of the request tx, from the adapter lifecycle. */
    requestHash: string | undefined;
    /** Event the request tx emits carrying `(owner, requestId)`. */
    requestEventName: string;
    /** GameLogic function that finishes the request once entropy reveals. */
    settleFunctionName: string;
    settleGas: bigint;
    /** Prefix for the settle-failure log, e.g. `settleMint`. */
    label: string;
}

export interface EvmEntropySettleFlow {
    /** Non-null from the request tx landing until the caller clears it. */
    pendingRequestId: bigint | null;
    /**
     * Block the request tx landed in, for callers that watch a settled event.
     *
     * Both the reveal and, when a keeper is running, the settle itself can land
     * before a watch armed from the request can start looking. Every watch in this
     * flow therefore reads from here rather than from the current head.
     */
    requestBlockNumber: bigint | undefined;
    /** Receipt of the settle tx, for callers that parse the settled event out of it. */
    settleReceipt: TransactionReceipt | undefined;
    settleConfirmed: boolean;
    isSettling: boolean;
    settleError: Error | null;
    /** Drop the pending request without touching the adapter lifecycle. */
    clearPending: () => void;
    /**
     * Clear the settle mutation's error and hash only. Leaves the pending request
     * alone, so dismissing an error does not abandon a request that is still
     * settleable on chain.
     */
    clearSettleError: () => void;
    /** Full local reset: pending request, the sent-guard, and the settle mutation. */
    reset: () => void;
}

export const useEvmEntropySettleFlow = (
    options: EvmEntropySettleFlowOptions,
): EvmEntropySettleFlow => {
    const { enabled, requestHash, requestEventName, settleFunctionName, settleGas, label } = options;
    const { evm } = usePetsConfig();
    const { address } = useAccount();

    const [pendingRequestId, setPendingRequestId] = useState<bigint | null>(null);

    // 1. Pull our requestId out of the request tx receipt. Filtered by owner: one
    //    block can carry other players' requests for the same event.
    const { data: requestReceipt } = useWaitForTransactionReceipt({
        hash: enabled && requestHash ? (requestHash as `0x${string}`) : undefined,
    });
    useEffect(() => {
        if (!enabled || !requestReceipt || !address || !evm?.gameLogic.abi) return;
        try {
            const logs = parseEventLogs({
                abi: evm.gameLogic.abi,
                logs: requestReceipt.logs,
                eventName: requestEventName,
                strict: false,
            }) as unknown as { args: { owner?: string; requestId?: bigint } }[];
            const mine = logs.find((l) => l.args.owner?.toLowerCase() === address.toLowerCase());
            if (mine?.args.requestId != null) setPendingRequestId(mine.args.requestId);
        } catch { /* not our tx shape / ABI mismatch */ }
    }, [enabled, requestReceipt, address, evm?.gameLogic.abi, requestEventName]);

    // 2. The Entropy contract address, needed to watch `Revealed`.
    const { data: entropyAddress } = useReadContract({
        address: evm?.gameLogic.address,
        abi: evm?.gameLogic.abi ?? [],
        functionName: 'entropy',
        chainId: evm?.chainId,
        query: { enabled: enabled && Boolean(evm?.gameLogic.address) },
    });

    // 3. Send the settle tx when entropy reveals for our request.
    const settle = useWriteContract();
    const settleSentRef = useRef(false);
    const handleEntropyFulfilled = useCallback((id: bigint) => {
        if (settleSentRef.current || !evm?.gameLogic.address) return;
        settleSentRef.current = true;
        settle.writeContract(
            {
                address: evm.gameLogic.address,
                abi: evm.gameLogic.abi,
                functionName: settleFunctionName,
                args: [id],
                gas: settleGas,
                chainId: evm.chainId,
            },
            {
                onError: (e) => {
                    // Re-arm. The flag exists to stop one reveal sending two settles,
                    // not to make a rejected or reverted settle permanent: settling is
                    // permissionless and retryable by design, and the request stays
                    // pending on chain until it lands. Leaving it set strands the flow
                    // with the fees already spent and no way to finish it.
                    settleSentRef.current = false;
                    console.error(`[${label}]`, e);
                },
            },
        );
    }, [evm?.gameLogic.address, evm?.gameLogic.abi, evm?.chainId, settle, settleFunctionName, settleGas, label]);

    // 4. Watch Pyth Entropy `Revealed` (caller = gameLogic, sequenceNumber = requestId).
    useWatchEntropyFulfillment({
        entropyAddress: enabled ? (entropyAddress as `0x${string}` | undefined) : undefined,
        gameLogicAddress: enabled ? evm?.gameLogic.address : undefined,
        requestId: enabled ? pendingRequestId : null,
        fromBlock: requestReceipt?.blockNumber,
        onFulfilled: handleEntropyFulfilled,
    });

    // 5. We sent the settle, so the settled event is in its receipt. Event
    //    subscriptions lag or drop over some RPCs; this path does not.
    const { data: settleReceipt, isSuccess: settleConfirmed } = useWaitForTransactionReceipt({
        hash: settle.data,
        query: { enabled: !!settle.data },
    });

    const clearPending = useCallback(() => setPendingRequestId(null), []);

    const clearSettleError = useCallback(() => settle.reset(), [settle]);

    const reset = useCallback(() => {
        setPendingRequestId(null);
        settleSentRef.current = false;
        settle.reset();
    }, [settle]);

    return {
        pendingRequestId,
        requestBlockNumber: requestReceipt?.blockNumber,
        settleReceipt,
        settleConfirmed: enabled && settleConfirmed,
        isSettling: enabled && settle.isPending,
        settleError: (settle.error as Error | null) ?? null,
        clearPending,
        clearSettleError,
        reset,
    };
};
