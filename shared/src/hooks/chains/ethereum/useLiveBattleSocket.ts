import { useEffect, useState } from 'react';
import { decodeSimOutcome, type SimOutcome } from '../../../utils/combat';
import { decodeBattleResolvedResult, type LiveBattleWireMessage } from '../../../types/liveBattleSocket';
import type { BattleResolvedResult } from '../../../types/battle';

export interface LiveBattleSocketState {
    /** Backend-computed sim, pushed the instant entropy reveals. Presentation only. */
    liveOutcome: SimOutcome | null;
    /** The actual settled outcome, pushed once the keeper's settle tx confirms —
     *  decoded from the same on-chain BattleResolved event the keeper itself reads,
     *  so this is just as authoritative as watching the event directly would be. */
    resolvedResult: BattleResolvedResult | null;
}

const EMPTY_STATE: LiveBattleSocketState = { liveOutcome: null, resolvedResult: null };

/**
 * Receives the backend settle keeper's pushed battle updates (docs/plan-realtime-battle-ux.md's
 * live-battle-socket feature) over WebSocket — both the live pre-settle sim and the final
 * settled result. This is the *only* source of battle-in-progress information the frontend
 * uses; it deliberately does not fall back to polling the chain directly, since that RPC
 * watching proved unreliable against public endpoints (see keeper.ts's pollContractEvents
 * comment) — a disconnected/unavailable socket just means no live updates for this battle,
 * not a fallback to a different, less reliable mechanism.
 */
export function useLiveBattleSocket(
    wsUrl: string | undefined,
    chainId: number | undefined,
    requestId: bigint | null,
): LiveBattleSocketState {
    const [state, setState] = useState<LiveBattleSocketState>(EMPTY_STATE);

    useEffect(() => {
        setState(EMPTY_STATE);
        if (!wsUrl || !chainId || requestId == null) return;

        let cancelled = false;
        const ws = new WebSocket(wsUrl);

        ws.onmessage = (event) => {
            if (cancelled) return;
            try {
                const msg = JSON.parse(event.data as string) as LiveBattleWireMessage;
                if (msg.chainId !== chainId || msg.requestId !== requestId.toString()) return;
                if (msg.type === 'live') {
                    setState((prev) => ({ ...prev, liveOutcome: decodeSimOutcome(msg.outcome) }));
                } else {
                    setState((prev) => ({ ...prev, resolvedResult: decodeBattleResolvedResult(msg.result) }));
                }
            } catch {
                // Malformed message — ignore, no update for this one.
            }
        };

        return () => {
            cancelled = true;
            ws.close();
        };
    }, [wsUrl, chainId, requestId]);

    return state;
}
