import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, usePublicClient, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { parseEventLogs } from 'viem';
import { usePetsConfig } from '../../../contexts/PetsConfigContext';
import { useLiveBattleSocket } from './useLiveBattleSocket';
import { EVM_GAS_LIMITS } from './gasLimits';
import { sleep } from '../../../utils/common';
import type { BattleResolvedResult, EvmBattlePhase } from '../../../types/battle';

type UseEvmBattleFlowParams = {
    /** `requestBattle` tx hash from the adapter; drives the rest of the flow. */
    requestHash?: `0x${string}`;
    enabled: boolean;
    onResolved?: (result: BattleResolvedResult) => void;
};

/** How long to wait after the request confirms before even trying to self-settle — a
 *  generous estimate covering typical entropy-reveal latency plus the keeper's own settle
 *  time, so the fallback essentially never engages in the normal case. */
const FALLBACK_START_DELAY_MS = 60_000;
/** Once the fallback window opens, how often to re-check (via a read-only simulateContract,
 *  no wallet prompt) whether settle would actually succeed yet. */
const FALLBACK_SIMULATE_RETRY_MS = 5_000;
/** ~60s of retrying (on top of FALLBACK_START_DELAY_MS) before giving up waiting for entropy
 *  and sending the real transaction anyway, letting it revert if reveal truly never lands. */
const FALLBACK_SIMULATE_MAX_ATTEMPTS = 12;

/**
 * EVM battle settlement, normally hands-off after the request. Given the `requestBattle`
 * tx hash, this:
 *   1. parses the requestId from `BattleRandomnessRequested`,
 *   2. gets live-progress updates (sim + final result) from the backend settle keeper over
 *      WebSocket (useLiveBattleSocket) — deliberately not from watching chain events
 *      directly, since that RPC watching proved unreliable against public endpoints (see
 *      settle-keeper/keeper.ts's pollContractEvents comment); a disconnected socket just
 *      means no live updates, not a fallback to a less reliable mechanism,
 *   3. as a safety net independent of the backend entirely, starts trying to settle from the
 *      player's own wallet after FALLBACK_START_DELAY_MS if no result has arrived (keeper
 *      outage / backend down) — checked via read-only simulation first so the player isn't
 *      asked to sign (and pay gas for) a transaction that would obviously revert,
 *   4. resolves from whichever arrives first: the socket's authoritative `resolved` message,
 *      or (for a self-sent fallback settle) this hook's own transaction receipt.
 */
export const useEvmBattleFlow = ({ requestHash, enabled, onResolved }: UseEvmBattleFlowParams) => {
    const { evm } = usePetsConfig();
    const { address } = useAccount();
    const gameLogic = evm?.gameLogic.address;
    const gameLogicAbi = useMemo(() => evm?.gameLogic.abi ?? [], [evm?.gameLogic.abi]);
    const chainId = evm?.chainId;
    const publicClient = usePublicClient({ chainId });

    const [requestId, setRequestId] = useState<bigint | null>(null);
    const [phase, setPhase] = useState<EvmBattlePhase>('idle');
    const [result, setResult] = useState<BattleResolvedResult | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const onResolvedRef = useRef(onResolved);
    onResolvedRef.current = onResolved;

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

    // 2. Live updates from the backend over WebSocket — the sole source of in-progress
    // battle info (see this hook's header comment for why not chain-watching).
    const { liveOutcome, resolvedResult } = useLiveBattleSocket(evm?.liveBattleWsUrl, chainId, requestId);

    // 3. settleBattle tx — normally sent by the backend settle keeper, not the player. This
    // hook only sends it itself as a last-resort fallback (see maybeStartFallback below).
    const settle = useWriteContract();
    const settleSentRef = useRef(false);
    const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const fallbackCancelledRef = useRef(false);

    const clearFallbackTimer = useCallback(() => {
        if (fallbackTimerRef.current != null) {
            clearTimeout(fallbackTimerRef.current);
            fallbackTimerRef.current = null;
        }
    }, []);

    const sendSettleFallback = useCallback((id: bigint) => {
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

    // Waits for settle to actually be able to succeed (read-only simulateContract, no wallet
    // prompt) before asking the player to sign — avoids wasting their gas on a transaction
    // that reverts because entropy genuinely hasn't revealed yet.
    const waitThenSendFallback = useCallback(async (id: bigint) => {
        if (!gameLogic || !publicClient) return;
        for (let attempt = 0; attempt < FALLBACK_SIMULATE_MAX_ATTEMPTS; attempt++) {
            if (settleSentRef.current || fallbackCancelledRef.current) return;
            try {
                await publicClient.simulateContract({
                    address: gameLogic,
                    abi: gameLogicAbi,
                    functionName: 'settleBattle',
                    args: [id],
                });
                break; // would succeed now
            } catch {
                await sleep(FALLBACK_SIMULATE_RETRY_MS);
            }
        }
        if (!settleSentRef.current && !fallbackCancelledRef.current) sendSettleFallback(id);
    }, [gameLogic, gameLogicAbi, publicClient, sendSettleFallback]);

    // Latest-ref so the arming effect below doesn't depend on this callback's identity —
    // `settle` (from useWriteContract) is a new object every render, which would otherwise
    // reset the 60s timer on every re-render while awaiting-vrf and defeat the whole point
    // of the fallback (see onResolvedRef above for the same pattern).
    const waitThenSendFallbackRef = useRef(waitThenSendFallback);
    waitThenSendFallbackRef.current = waitThenSendFallback;

    // Starts the fallback window the moment the request is confirmed — independent of any
    // reveal signal, since the whole point is this must work even if the backend (keeper and
    // live-battle-socket both) is completely down.
    useEffect(() => {
        if (phase !== 'awaiting-vrf' || requestId == null) return;
        fallbackCancelledRef.current = false;
        clearFallbackTimer();
        fallbackTimerRef.current = setTimeout(() => {
            setPhase('awaiting-settle');
            void waitThenSendFallbackRef.current(requestId);
        }, FALLBACK_START_DELAY_MS);
        return clearFallbackTimer;
    }, [phase, requestId, clearFallbackTimer]);

    // Cancel any pending fallback on unmount so it can't fire (and send a tx) after the
    // component watching this battle is gone.
    useEffect(() => () => { fallbackCancelledRef.current = true; clearFallbackTimer(); }, [clearFallbackTimer]);

    // 4. Resolve — fire at most once per battle, from whichever source arrives first.
    const resolvedFiredRef = useRef(false);
    const applyResolved = useCallback((resolved: BattleResolvedResult) => {
        if (resolvedFiredRef.current) return;
        resolvedFiredRef.current = true;
        fallbackCancelledRef.current = true;
        clearFallbackTimer(); // the keeper (or the fallback itself) already settled this
        setResult(resolved);
        setPhase('resolved');
        onResolvedRef.current?.(resolved);
    }, [clearFallbackTimer]);

    // Primary path: the backend's authoritative push, decoded from its own settle receipt.
    useEffect(() => {
        if (resolvedResult) applyResolved(resolvedResult);
    }, [resolvedResult, applyResolved]);

    // Fallback-only path: if *this hook* sent the settle tx, decode BattleResolved from its
    // own receipt directly rather than waiting on the socket (belt-and-braces — the socket
    // should also report it, but this doesn't depend on the backend at all).
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
            if (!mine) return;
            const a = mine.args;
            applyResolved({
                requestId: a.requestId as bigint,
                winnerId: a.winnerId as bigint,
                loserId: a.loserId as bigint,
                vrfSeed: a.randomness as bigint,
                firstWins: a.firstWins as boolean,
                rounds: Number(a.rounds),
                winnerHpRemaining: Number(a.winnerHpRemaining),
                xpWin: Number(a.xpWin),
                xpLoss: Number(a.xpLoss),
            });
        } catch { /* ignore */ }
    }, [enabled, settleReceipt, requestId, evm?.gameLogic.abi, applyResolved]);

    const reset = useCallback(() => {
        fallbackCancelledRef.current = true;
        clearFallbackTimer();
        setRequestId(null);
        setPhase('idle');
        setResult(null);
        setError(null);
        settleSentRef.current = false;
        resolvedFiredRef.current = false;
        settle.reset();
    }, [settle, clearFallbackTimer]);

    const isActive =
        phase === 'awaiting-vrf' ||
        phase === 'awaiting-settle' ||
        phase === 'settling' ||
        phase === 'resolving';

    return {
        phase,
        requestId,
        result,
        error: error ?? (settle.error as Error | null),
        isActive,
        reset,
        /** Backend-pushed sim outcome (log + startHp1/startHp2 + its own result), available
         *  as soon as entropy reveals — drives the live animation. Presentation only;
         *  `result` above (from BattleResolved) is always the authoritative outcome; see
         *  plan-realtime-battle-ux.md's reconciliation rule. Null until the backend pushes
         *  one (see useLiveBattleSocket's header comment on why there's no other source). */
        liveReplay: liveOutcome,
    };
};
