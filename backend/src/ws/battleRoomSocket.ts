import type { Server } from 'node:http';
import { URL } from 'node:url';

// `WebSocket.Server` is only attached to the default export under `ws`'s CJS entry point;
// its ESM entry (`wrapper.mjs`, what Vitest resolves) exports the server class only as the
// named `WebSocketServer`, with no `.Server` static property. The named form resolves
// correctly under both, so it's used here instead.
import WebSocket, { WebSocketServer } from 'ws';

/**
 * The per-room, notification-only channel for backend-authoritative battles
 * (docs/plan-backend-battle-architecture.md §J).
 *
 * It replaced a global-broadcast socket that pushed chain-derived data for the
 * on-chain flow, filtered client-side by `(chainId, requestId)`. Broadcasting was
 * acceptable there because anyone could read the same data straight off the chain
 * anyway. Backend-resolved battles carry full combat logs, which is not chain-derived
 * data — a global broadcast would tell every connected client the outcome of every
 * battle as it resolves. So this channel scopes delivery to one room, and carries
 * no battle content at all:
 * only "battleId X changed to state Y, go re-fetch it" (§J's read APIs, Step
 * 27). A client that missed a notification, or was never connected, gets the
 * exact same information by polling those same endpoints — this socket makes
 * that faster, never more authoritative.
 */

export interface BattleRoomNotification {
    type: 'battle-updated';
    battleId: string;
    state: string;
}

let wss: WebSocketServer | null = null;
const roomMembers = new Map<string, Set<WebSocket>>();

export function startBattleRoomSocket(server: Server): void {
    wss = new WebSocketServer({ server, path: '/ws/battle-room' });
    wss.on('connection', (socket, request) => {
        const roomId = roomIdFromUrl(request.url);
        if (!roomId) {
            socket.close(1008, 'roomId query parameter is required');
            return;
        }
        joinRoom(roomId, socket);
        socket.on('close', () => leaveRoom(roomId, socket));
    });
    console.log('[battle-room-ws] listening on /ws/battle-room');
}

export function stopBattleRoomSocket(): void {
    wss?.close();
    wss = null;
    roomMembers.clear();
}

/**
 * Notifies every client watching `roomId`. A no-op, not an error, when nobody
 * is connected — most battles are never watched live at all, and that is an
 * entirely normal outcome, not a delivery failure worth surfacing.
 */
export function notifyBattleRoom(roomId: string, message: BattleRoomNotification): void {
    const members = roomMembers.get(roomId);
    if (!members || members.size === 0) return;
    const payload = JSON.stringify(message);
    for (const client of members) {
        if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
}

/** Same as `notifyBattleRoom`, but a no-op when there is no room to notify at all. */
export function notifyBattleRoomIfPresent(roomId: string | null, message: BattleRoomNotification): void {
    if (roomId) notifyBattleRoom(roomId, message);
}

function joinRoom(roomId: string, socket: WebSocket): void {
    let members = roomMembers.get(roomId);
    if (!members) {
        members = new Set();
        roomMembers.set(roomId, members);
    }
    members.add(socket);
}

function leaveRoom(roomId: string, socket: WebSocket): void {
    const members = roomMembers.get(roomId);
    if (!members) return;
    members.delete(socket);
    if (members.size === 0) roomMembers.delete(roomId);
}

function roomIdFromUrl(url: string | undefined): string | null {
    if (!url) return null;
    try {
        // The base is irrelevant and discarded — only used because WHATWG URL requires
        // an absolute URL to parse a relative one against.
        const parsed = new URL(url, 'http://internal');
        return parsed.searchParams.get('roomId');
    } catch {
        return null;
    }
}
