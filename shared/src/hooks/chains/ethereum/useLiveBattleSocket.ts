import { useEffect, useState } from 'react';
import { decodeSimOutcome, type SimOutcome, type SimOutcomeWire } from '../../../utils/combat';

interface LiveBattleWireMessage {
    chainId: number;
    requestId: string;
    outcome: SimOutcomeWire;
}

/**
 * Receives the backend settle keeper's pushed battle sim (docs/plan-realtime-battle-ux.md's
 * live-battle-socket feature) the moment Pyth Entropy reveals — the backend runs the same
 * sim CombatSim.settleBattle will use and broadcasts it, so this doesn't depend on the
 * frontend's own RPC event watching. Presentation only: the on-chain `BattleResolved` event
 * (handled elsewhere in useEvmBattleFlow) remains authoritative regardless of what this
 * returns.
 *
 * Degrades to `null` (no live animation, same as if this feature didn't exist) whenever
 * `wsUrl` is unset, the socket is disconnected, or a message doesn't match the current
 * chain/requestId — never throws into the caller.
 */
export function useLiveBattleSocket(
    wsUrl: string | undefined,
    chainId: number | undefined,
    requestId: bigint | null,
): SimOutcome | null {
    const [outcome, setOutcome] = useState<SimOutcome | null>(null);

    useEffect(() => {
        setOutcome(null);
        if (!wsUrl || !chainId || requestId == null) return;

        let cancelled = false;
        const ws = new WebSocket(wsUrl);

        ws.onmessage = (event) => {
            if (cancelled) return;
            try {
                const msg = JSON.parse(event.data as string) as LiveBattleWireMessage;
                if (msg.chainId !== chainId || msg.requestId !== requestId.toString()) return;
                setOutcome(decodeSimOutcome(msg.outcome));
            } catch {
                // Malformed message — ignore, no live animation for this one.
            }
        };

        return () => {
            cancelled = true;
            ws.close();
        };
    }, [wsUrl, chainId, requestId]);

    return outcome;
}
