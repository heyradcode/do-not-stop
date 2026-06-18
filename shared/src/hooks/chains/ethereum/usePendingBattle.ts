import { useCallback, useEffect } from 'react';
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { usePetsConfig } from '../../../contexts/PetsConfigContext';

export interface PendingBattleTx {
    run(): Promise<void>;
    isPending: boolean;
    error: Error | null;
    hash?: `0x${string}`;
}

export interface PendingBattle {
    /** The open VRF request id for this pet (undefined / 0n when none). */
    requestId?: bigint;
    /** True when this pet has an unresolved battle blocking new ones. */
    isPending: boolean;
    /** settleBattle — works once VRF has fulfilled; permissionless. */
    settle: PendingBattleTx;
    /** cancelBattle — only before fulfillment; requester or contract owner. */
    cancel: PendingBattleTx;
    refetch(): void;
}

/**
 * Reads a pet's open battle request (`petBattleRequestId`) and exposes manual
 * settle/cancel so an interrupted async battle can be recovered from the UI.
 * EVM-only; returns a not-pending shell on other chains.
 */
export const usePendingBattle = (petId?: string): PendingBattle => {
    const { evm } = usePetsConfig();
    const gameLogic = evm?.gameLogic.address;
    const abi = evm?.gameLogic.abi ?? [];
    const chainId = evm?.chainId;
    const enabled = Boolean(gameLogic && petId);

    const { data: requestIdData, refetch: refetchId } = useReadContract({
        address: gameLogic,
        abi,
        functionName: 'petBattleRequestId',
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

    // Re-read petBattleRequestId once either action confirms so the notice clears.
    useEffect(() => {
        if (settleR.isSuccess || cancelR.isSuccess) void refetchId();
    }, [settleR.isSuccess, cancelR.isSuccess, refetchId]);

    const settle: PendingBattleTx = {
        async run() {
            if (!gameLogic || requestId == null) throw new Error('No pending battle to settle');
            await settleW.writeContractAsync({ address: gameLogic, abi, functionName: 'settleBattle', args: [requestId], gas: 800000n, chainId });
        },
        isPending: settleW.isPending || (!!settleW.data && !settleR.isSuccess && !settleR.isError),
        error: (settleW.error as Error | null) ?? (settleR.isError ? (settleR.error as Error) : null),
        hash: settleW.data,
    };

    const cancel: PendingBattleTx = {
        async run() {
            if (!gameLogic || requestId == null) throw new Error('No pending battle to cancel');
            await cancelW.writeContractAsync({ address: gameLogic, abi, functionName: 'cancelBattle', args: [requestId], gas: 200000n, chainId });
        },
        isPending: cancelW.isPending || (!!cancelW.data && !cancelR.isSuccess && !cancelR.isError),
        error: (cancelW.error as Error | null) ?? (cancelR.isError ? (cancelR.error as Error) : null),
        hash: cancelW.data,
    };

    return { requestId, isPending, settle, cancel, refetch };
};
