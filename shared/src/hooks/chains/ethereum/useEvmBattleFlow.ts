import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useReadContract, useWatchContractEvent, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { parseEventLogs } from 'viem';
import { usePetsConfig } from '../../../contexts/PetsConfigContext';
import { useWatchEntropyFulfillment } from './useWatchEntropyFulfillment';
import { useLiveBattleReplay, type LiveBattleReplayInput } from './useLiveBattleReplay';
import { EVM_GAS_LIMITS } from './gasLimits';
import type { BattleResolvedResult, EvmBattlePhase } from '../../../types/battle';
import type { SkillConfig } from '../../../utils/combat';

type UseEvmBattleFlowParams = {
    /** `requestBattle` tx hash from the adapter; drives the rest of the flow. */
    requestHash?: `0x${string}`;
    enabled: boolean;
    onResolved?: (result: BattleResolvedResult) => void;
};

/** How long to wait for the backend settle keeper before falling back to sending
 *  settleBattle from the player's own wallet (plan-realtime-battle-impl.md Phase 2). */
const FALLBACK_SETTLE_DELAY_MS = 45_000;

/**
 * EVM battle settlement, normally hands-off after the request. Given the
 * `requestBattle` tx hash, this:
 *   1. parses the VRF `requestId` from `BattleRandomnessRequested`,
 *   2. waits for the coordinator's `RandomWordsFulfilled`,
 *   3. waits for the backend settle keeper to send `settleBattle(requestId)` —
 *      only sends it from the player's own wallet if the keeper hasn't within
 *      FALLBACK_SETTLE_DELAY_MS (keeper outage / not configured),
 *   4. decodes `BattleResolved` for the outcome + seed used by fight replay.
 */
export const useEvmBattleFlow = ({ requestHash, enabled, onResolved }: UseEvmBattleFlowParams) => {
    const { evm } = usePetsConfig();
    const { address } = useAccount();
    const gameLogic = evm?.gameLogic.address;
    const gameLogicAbi = useMemo(() => evm?.gameLogic.abi ?? [], [evm?.gameLogic.abi]);
    const gameConfigAddress = evm?.gameConfig?.address;
    const gameConfigAbi = useMemo(() => evm?.gameConfig?.abi ?? [], [evm?.gameConfig?.abi]);
    const chainId = evm?.chainId;

    const [requestId, setRequestId] = useState<bigint | null>(null);
    const [phase, setPhase] = useState<EvmBattlePhase>('idle');
    const [result, setResult] = useState<BattleResolvedResult | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [randomNumber, setRandomNumber] = useState<bigint | null>(null);
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

    // Live-replay inputs (plan-realtime-battle-impl.md Phase 4): the request-time
    // snapshot (frozen sim inputs, Phase 1) and the current skill balance config.
    // Read from chain, never from the indexer/roster cache, which lags — see the
    // plan's input-drift race note. GameConfig is optional in PetsEvmConfig, so
    // this degrades to "no live replay" rather than breaking the battle flow when
    // a deployment doesn't wire it up.
    const { data: skillConfigData } = useReadContract({
        address: gameConfigAddress,
        abi: gameConfigAbi,
        functionName: 'getSkillConfig',
        chainId,
        query: { enabled: enabled && Boolean(gameConfigAddress) },
    });
    const { data: battleRequestData } = useReadContract({
        address: gameLogic,
        abi: gameLogicAbi,
        functionName: 'getBattleRequest',
        args: requestId != null ? [requestId] : undefined,
        chainId,
        query: { enabled: enabled && Boolean(gameLogic) && requestId != null },
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

    // 3. settleBattle tx — normally sent by the backend settle keeper, not the player.
    // This hook only sends it itself as a fallback (see handleFulfilled below).
    const settle = useWriteContract();
    const settleSentRef = useRef(false);
    const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    // Entropy has revealed: the keeper is expected to settle from here. Only fall
    // back to the player's wallet if BattleResolved hasn't shown up in time.
    // `randomNumberHex` is also the exact seed the client-side sim replays from —
    // storing it is what lets the live animation start before settleBattle lands.
    const handleFulfilled = useCallback((id: bigint, randomNumberHex: `0x${string}`) => {
        setRandomNumber(BigInt(randomNumberHex));
        if (settleSentRef.current) return;
        setPhase('awaiting-settle');
        clearFallbackTimer();
        fallbackTimerRef.current = setTimeout(() => sendSettleFallback(id), FALLBACK_SETTLE_DELAY_MS);
    }, [clearFallbackTimer, sendSettleFallback]);

    // Cancel any pending fallback timer on unmount so it can't fire (and send a tx)
    // after the component watching this battle is gone.
    useEffect(() => clearFallbackTimer, [clearFallbackTimer]);

    // 2. Wait for Pyth Entropy Revealed, then settle.
    useWatchEntropyFulfillment({
        entropyAddress: enabled ? (entropyAddress as `0x${string}` | undefined) : undefined,
        gameLogicAddress: enabled ? gameLogic : undefined,
        requestId: enabled ? requestId : null,
        onFulfilled: handleFulfilled,
    });

    // Live replay: compose the sim inputs into the exact shape useLiveBattleReplay
    // wants, memoized so it only recomputes when a value actually changes (not on
    // every render — simulate() re-runs a full 30-round fight otherwise).
    const skillConfig = useMemo<SkillConfig | null>(() => {
        if (!skillConfigData) return null;
        const sc = skillConfigData as Record<string, unknown>;
        return {
            tankHpMult: Number(sc.tankHpMult),
            shellDefMult: Number(sc.shellDefMult),
            swiftCritBonus: Number(sc.swiftCritBonus),
            cunningCritCap: Number(sc.cunningCritCap),
            furyDmgMult: Number(sc.furyDmgMult),
            furyHpThreshold: Number(sc.furyHpThreshold),
            sageMdefMult: Number(sc.sageMdefMult),
            bloodlustBps: Number(sc.bloodlustBps),
        };
    }, [skillConfigData]);

    const snapshot = useMemo(() => {
        if (!battleRequestData) return null;
        const br = battleRequestData as Record<string, unknown>;
        // Requests from before the Phase 1 snapshot upgrade have no frozen inputs
        // to replay from — skip live replay for those rather than sim from zeros.
        if (!br.snapshotted) return null;
        return {
            dna1: br.dna1 as bigint,
            dna2: br.dna2 as bigint,
            rarity1: Number(br.rarity1),
            rarity2: Number(br.rarity2),
            level1: Number(br.level1),
            level2: Number(br.level2),
            speciesId1: Number(br.speciesId1),
            speciesId2: Number(br.speciesId2),
        };
    }, [battleRequestData]);

    const replayInput = useMemo<LiveBattleReplayInput | null>(() => {
        if (!snapshot || !skillConfig || randomNumber == null) return null;
        return { ...snapshot, randomNumber, skillConfig };
    }, [snapshot, skillConfig, randomNumber]);

    const liveReplay = useLiveBattleReplay(replayInput);

    // 4. Resolve from BattleResolved — fire at most once per battle.
    const resolvedFiredRef = useRef(false);
    const applyResolved = useCallback((a: Record<string, unknown>) => {
        if (resolvedFiredRef.current) return;
        resolvedFiredRef.current = true;
        clearFallbackTimer(); // the keeper (or the fallback itself) already settled this
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
    }, [clearFallbackTimer]);

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
        // See useWatchEntropyFulfillment.ts's comment: forces eth_getLogs polling instead of
        // eth_newFilter/eth_getFilterChanges, which public RPCs like Base Sepolia's default
        // endpoint don't reliably keep alive between requests.
        poll: true,
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
        clearFallbackTimer();
        setRequestId(null);
        setPhase('idle');
        setResult(null);
        setError(null);
        setRandomNumber(null);
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
        /** Client-side sim outcome (log + startHp1/startHp2 + its own result),
         *  available as soon as entropy reveals — drives the live animation.
         *  Presentation only; `result` above (from BattleResolved) is always the
         *  authoritative outcome; see plan-realtime-battle-ux.md's
         *  reconciliation rule. Null until the snapshot/skillConfig/randomNumber
         *  are all known, or if this deployment has no GameConfig wired up. */
        liveReplay,
    };
};
