import type { Server } from 'node:http';
// `import WebSocket, { Server as WebSocketServer } from 'ws'` isn't available under the
// installed @types/ws version (7.4, CJS `export = WebSocket` with `WebSocket.Server` as a
// namespace member, not a named `WebSocketServer` export — that's an 8.x typings addition).
// The installed `ws` runtime (8.18.3) supports both forms; using the older-but-compatible
// `WebSocket.Server` form works regardless of which @types/ws version ends up installed.
import WebSocket from 'ws';
// Deep import (not the `@shared/core` barrel): the barrel re-exports React hooks/contexts
// (.tsx files) that pull JSX into backend's typecheck, which has no --jsx support (same
// reasoning as settle-keeper-solana's imports).
import type { SimOutcomeWire } from '@shared/core/src/utils/combat';

/**
 * Pushes a computed battle sim (backend-run, once Pyth Entropy reveals) to any connected
 * frontend so the live-before-settle animation doesn't depend on the client's own RPC
 * event watching (which public RPCs like Base Sepolia's default endpoint make unreliable
 * — see settle-keeper/keeper.ts's pollContractEvents comment). Presentation only: the
 * on-chain BattleResolved event remains authoritative, unchanged by this feature.
 *
 * No per-battle subscription bookkeeping — broadcasts to every connected client, which
 * filters by (chainId, requestId) itself. Battle volume doesn't justify the added
 * complexity of a subscribe/unsubscribe protocol.
 */
export interface LiveBattleMessage {
    chainId: number;
    /** Decimal string (bigint requestId is not JSON-safe as a number). */
    requestId: string;
    outcome: SimOutcomeWire;
}

let wss: WebSocket.Server | null = null;

export function startLiveBattleSocket(server: Server): void {
    wss = new WebSocket.Server({ server, path: '/ws/live-battle' });
    console.log('[live-battle-ws] listening on /ws/live-battle');
}

export function stopLiveBattleSocket(): void {
    wss?.close();
    wss = null;
}

export function broadcastLiveBattle(message: LiveBattleMessage): void {
    if (!wss) return;
    const payload = JSON.stringify(message);
    for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
}
