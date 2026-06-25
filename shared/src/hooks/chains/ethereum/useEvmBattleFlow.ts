import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useReadContract, useWatchContractEvent, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { parseEventLogs } from 'viem';
import { usePetsConfig } from '../../../contexts/PetsConfigContext';
import { useWatchEntropyFulfillment } from './useWatchEntropyFulfillment';
import { EVM_GAS_LIMITS } from './gasLimits';
import type { BattleResolvedResult, EvmBattlePhase } from '../../../types/battle';

type UseEvmBattleFlowParams = {
    /** `requestBattle` tx hash from the adapter; drives the rest of the flow. */
    requestHash?: `0x${string}`;
    enabled: boolean;
    onResolved?: (result: BattleResolvedResult) => void;
};

/**
 * Frontend-driven EVM battle settlement (mirrors the Solana reveal+settle
 * pattern). Given the `requestBattle` tx hash, this:
 *   1. parses the VRF `requestId` from `BattleRandomnessRequested`,
 *   2. waits for the coordinator's `RandomWordsFulfilled`,
 *   3. sends the `settleBattle(requestId)` tx,
 *   4. decodes `BattleResolved` for the outcome + seed used by fight replay.
 */
export const useEvmBattleFlow = ({ requestHash, enabled, onResolved }: UseEvmBattleFlowParams) => {
    const { evm } = usePetsConfig();
    const { address } = useAccount();
    const gameLogic = evm?.gameLogic.address;
    const gameLogicAbi = useMemo(() => evm?.gameLogic.abi ?? [], [evm?.gameLogic.abi]);
    const chainId = evm?.chainId;

    const [requestId, setRequestId] = useState<bigint | null>(null);
    const [phase, setPhase] = useState<EvmBattlePhase>('idle');
    const [result, setResult] = useState<BattleResolvedResult | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const onResolvedRef = useRef(onResolved);
    onResolvedRef.current = onResolved;

    // Pyth Entropy address — read from GameLogic.entropy() for the Revealed watcher.
    const { data: entropyAddress } = useReadContract({
        address: gameLogic,
        abi: gameLogicAbi,
        functionName: 'entropy',
        chainId,
        query: { enabled: enabled && Boolean(gameLogic) },
    });

    // 1. Parse requestId from the request tx receipt.
    const { data: requestReceipt } = useWaitForTransactionReceipt({
        hash: enabled && requestHash ? requestHash : undefined,
    });
    useEffect(() => {
        if (!enabled || !requestReceipt || !address || !evm?.gameLogic.abi) return;
        try {
            const logs = parseEventLogs({
                abi: evm.gameLogic.abi,
                logs: requestReceipt.logs,
                eventName: 'BattleRandomnessRequested',
                strict: false,
            }) as unknown as { args: { requester?: string; requestId?: bigint } }[];
            const mine = logs.find((l) => l.args.requester?.toLowerCase() === address.toLowerCase());
            if (mine?.args.requestId != null) {
                setRequestId(mine.args.requestId);
                setPhase('awaiting-vrf');
            }
        } catch {
            /* not a battle tx / ABI mismatch */
        }
    }, [enabled, requestReceipt, address, evm?.gameLogic.abi]);

    // 3. settleBattle tx.
    const settle = useWriteContract();
    const settleSentRef = useRef(false);
    const handleFulfilled = useCallback((id: bigint) => {
        if (settleSentRef.current || !gameLogic) return;
        settleSentRef.current = true;
        setPhase('settling');
        settle.writeContract(
            // settle runs the full combat sim + auto-leveling + writes; give it a
            // generous explicit limit (consistent with the request/breed paths).
            { address: gameLogic, abi: gameLogicAbi, functionName: 'settleBattle', args: [id], gas: EVM_GAS_LIMITS.settleBattle, chainId },
            {
                onSuccess: () => setPhase('resolving'),
                onError: (e) => { setError(e as Error); setPhase('error'); },
            },
        );
    }, [gameLogic, gameLogicAbi, chainId, settle]);

    // 2. Wait for Pyth Entropy Revealed, then settle.
    useWatchEntropyFulfillment({
        entropyAddress: enabled ? (entropyAddress as `0x${string}` | undefined) : undefined,
        gameLogicAddress: enabled ? gameLogic : undefined,
        requestId: enabled ? requestId : null,
        onFulfilled: handleFulfilled,
    });

    // 4. Resolve from BattleResolved — fire at most once per battle.
    const resolvedFiredRef = useRef(false);
    const applyResolved = useCallback((a: Record<string, unknown>) => {
        if (resolvedFiredRef.current) return;
        resolvedFiredRef.current = true;
        const resolved: BattleResolvedResult = {
            requestId: a.requestId as bigint,
            winnerId: a.winnerId as bigint,
            loserId: a.loserId as bigint,
            vrfSeed: a.vrfSeed as bigint,
            firstWins: a.firstWins as boolean,
            rounds: Number(a.rounds),
            winnerHpRemaining: Number(a.winnerHpRemaining),
            xpWin: Number(a.xpWin),
            xpLoss: Number(a.xpLoss),
        };
        setResult(resolved);
        setPhase('resolved');
        onResolvedRef.current?.(resolved);
    }, []);

    // Primary, reliable path: BattleResolved is in the settle tx receipt we sent.
    // Event subscriptions can lag/drop over some RPCs, so decode it from there.
    const { data: settleReceipt } = useWaitForTransactionReceipt({
        hash: settle.data,
        query: { enabled: !!settle.data },
    });
    useEffect(() => {
        if (!enabled || !settleReceipt || requestId == null || !evm?.gameLogic.abi) return;
        try {
            const logs = parseEventLogs({
                abi: evm.gameLogic.abi, logs: settleReceipt.logs, eventName: 'BattleResolved', strict: false,
            }) as unknown as { args: Record<string, unknown> }[];
            const mine = logs.find((l) => l.args.requestId === requestId);
            if (mine) applyResolved(mine.args);
        } catch { /* ignore */ }
    }, [enabled, settleReceipt, requestId, evm?.gameLogic.abi, applyResolved]);

    // Secondary path: watch BattleResolved (covers a settle sent outside this hook).
    useWatchContractEvent({
        address: gameLogic,
        abi: gameLogicAbi,
        eventName: 'BattleResolved',
        enabled: Boolean(enabled && gameLogic && requestId != null),
        onLogs(logs) {
            if (requestId == null) return;
            const typed = logs as unknown as { args: Record<string, unknown> }[];
            for (const log of typed) {
                if (log.args.requestId !== requestId) continue;
                applyResolved(log.args);
                return;
            }
        },
    });

    const reset = useCallback(() => {
        setRequestId(null);
        setPhase('idle');
        setResult(null);
        setError(null);
        settleSentRef.current = false;
        resolvedFiredRef.current = false;
        settle.reset();
    }, [settle]);

    const isActive = phase === 'awaiting-vrf' || phase === 'settling' || phase === 'resolving';

    return { phase, requestId, result, error: error ?? (settle.error as Error | null), isActive, reset };
};
