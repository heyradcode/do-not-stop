import { useCallback, useEffect } from 'react';
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { usePetsConfig } from '../../../contexts/PetsConfigContext';
import { EVM_GAS_LIMITS } from './gasLimits';

export interface PendingBreedTx {
    run(): Promise<void>;
    isPending: boolean;
    error: Error | null;
    hash?: `0x${string}`;
}

export interface PendingBreed {
    /** The open VRF breed request id for this pet (undefined / 0n when none). */
    requestId?: bigint;
    /** True when this pet has an unresolved breed blocking new ones. */
    isPending: boolean;
    /** settleBreed — works once VRF has fulfilled; mints the offspring. */
    settle: PendingBreedTx;
    /** cancelBreed — only before fulfillment; owner or contract admin. */
    cancel: PendingBreedTx;
    refetch(): void;
}

/**
 * Reads a pet's open breed request (`petBreedRequestId`) and exposes manual
 * settle/cancel so an interrupted async breed can be recovered from the UI.
 * EVM-only.
 */
export const usePendingBreed = (petId?: string): PendingBreed => {
    const { evm } = usePetsConfig();
    const gameLogic = evm?.gameLogic.address;
    const abi = evm?.gameLogic.abi ?? [];
    const chainId = evm?.chainId;
    const enabled = Boolean(gameLogic && petId);

    const { data: requestIdData, refetch: refetchId } = useReadContract({
        address: gameLogic,
        abi,
        functionName: 'petBreedRequestId',
        args: petId ? [BigInt(petId)] : undefined,
        chainId,
        query: { enabled },
    });

    const requestId = requestIdData as bigint | undefined;
    const isPending = requestId != null && requestId !== 0n;

    const settleW = useWriteContract();
    const cancelW = useWriteContract();
    const settleR = useWaitForTransactionReceipt({ hash: settleW.data, query: { enabled: !!settleW.data } });
    const cancelR = useWaitForTransactionReceipt({ hash: cancelW.data, query: { enabled: !!cancelW.data } });

    const refetch = useCallback(() => { void refetchId(); }, [refetchId]);

    useEffect(() => {
        if (settleR.isSuccess || cancelR.isSuccess) void refetchId();
    }, [settleR.isSuccess, cancelR.isSuccess, refetchId]);

    const settle: PendingBreedTx = {
        async run() {
            if (!gameLogic || requestId == null) throw new Error('No pending breed to settle');
            await settleW.writeContractAsync({ address: gameLogic, abi, functionName: 'settleBreed', args: [requestId], gas: EVM_GAS_LIMITS.settleBreed, chainId });
        },
        isPending: settleW.isPending || (!!settleW.data && !settleR.isSuccess && !settleR.isError),
        error: (settleW.error as Error | null) ?? (settleR.isError ? (settleR.error as Error) : null),
        hash: settleW.data,
    };

    const cancel: PendingBreedTx = {
        async run() {
            if (!gameLogic || requestId == null) throw new Error('No pending breed to cancel');
            await cancelW.writeContractAsync({ address: gameLogic, abi, functionName: 'cancelBreed', args: [requestId], gas: EVM_GAS_LIMITS.cancelBreed, chainId });
        },
        isPending: cancelW.isPending || (!!cancelW.data && !cancelR.isSuccess && !cancelR.isError),
        error: (cancelW.error as Error | null) ?? (cancelR.isError ? (cancelR.error as Error) : null),
        hash: cancelW.data,
    };

    return { requestId, isPending, settle, cancel, refetch };
};
