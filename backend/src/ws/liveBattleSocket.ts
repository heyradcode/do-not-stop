import type { Server } from 'node:http';
// `import WebSocket, { Server as WebSocketServer } from 'ws'` isn't available under the
// installed @types/ws version (7.4, CJS `export = WebSocket` with `WebSocket.Server` as a
// namespace member, not a named `WebSocketServer` export — that's an 8.x typings addition).
// The installed `ws` runtime (8.18.3) supports both forms; using the older-but-compatible
// `WebSocket.Server` form works regardless of which @types/ws version ends up installed.
import WebSocket from 'ws';
import type { LiveBattleWireMessage } from '@shared/core/node';

/**
 * Pushes battle updates (backend-run sim once entropy reveals, then the actual settled
 * result once the keeper's settle tx confirms) to any connected frontend, so the whole
 * live-battle flow — both the pre-settle animation and the final outcome — doesn't depend
 * on the client's own RPC event watching (which public RPCs like Base Sepolia's default
 * endpoint make unreliable; see settle-keeper/keeper.ts's pollContractEvents comment).
 *
 * No per-battle subscription bookkeeping — broadcasts to every connected client, which
 * filters by (chainId, requestId) itself. Battle volume doesn't justify the added
 * complexity of a subscribe/unsubscribe protocol.
 */
let wss: WebSocket.Server | null = null;

export function startLiveBattleSocket(server: Server): void {
    wss = new WebSocket.Server({ server, path: '/ws/live-battle' });
    console.log('[live-battle-ws] listening on /ws/live-battle');
}

export function stopLiveBattleSocket(): void {
    wss?.close();
    wss = null;
}

export function broadcastLiveBattle(message: LiveBattleWireMessage): void {
    if (!wss) return;
    const payload = JSON.stringify(message);
    for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
}
