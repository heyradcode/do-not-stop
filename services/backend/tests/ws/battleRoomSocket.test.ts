import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';

import {
    notifyBattleRoom,
    notifyBattleRoomIfPresent,
    startBattleRoomSocket,
    stopBattleRoomSocket,
} from '@ws/battleRoomSocket';

/**
 * Real HTTP server + real `ws` clients, not mocks: the property under test is
 * actual room-scoped delivery over the wire (§J) — a client in room A must
 * never receive a message meant for room B, and a message with no listeners
 * must not throw.
 */

let server: Server;
let baseUrl: string;

beforeEach(async () => {
    server = createServer();
    startBattleRoomSocket(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') {
        throw new Error('expected a bound TCP address');
    }
    baseUrl = `ws://127.0.0.1:${address.port}/ws/battle-room`;
});

afterEach(async () => {
    stopBattleRoomSocket();
    await new Promise<void>((resolve) => server.close(() => resolve()));
});

function connect(roomId: string | null): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
        const url = roomId === null ? baseUrl : `${baseUrl}?roomId=${roomId}`;
        const socket = new WebSocket(url);
        socket.once('open', () => resolve(socket));
        socket.once('error', reject);
    });
}

function nextMessage(socket: WebSocket): Promise<unknown> {
    return new Promise((resolve, reject) => {
        socket.once('message', (data) => resolve(JSON.parse(data.toString())));
        socket.once('close', (code, reason) => reject(new Error(`socket closed before a message arrived: ${code} ${reason}`)));
    });
}

function nextClose(socket: WebSocket): Promise<{ code: number; reason: string }> {
    return new Promise((resolve) => {
        socket.once('close', (code, reason) => resolve({ code, reason: reason.toString() }));
    });
}

describe('room scoping', () => {
    it('delivers a notification only to clients connected to that room', async () => {
        const inRoom = await connect('room_1');
        const inOtherRoom = await connect('room_2');
        const otherRoomMessage = nextMessage(inOtherRoom);

        const received = nextMessage(inRoom);
        notifyBattleRoom('room_1', { type: 'battle-updated', battleId: 'btl_1', state: 'signed' });

        await expect(received).resolves.toEqual({ type: 'battle-updated', battleId: 'btl_1', state: 'signed' });

        // The other room's client must never see this message. Race it against a message
        // that will definitely arrive (a second notification to its own room) so the test
        // does not depend on a fixed timeout to prove a negative.
        notifyBattleRoom('room_2', { type: 'battle-updated', battleId: 'btl_2', state: 'signed' });
        await expect(otherRoomMessage).resolves.toEqual({ type: 'battle-updated', battleId: 'btl_2', state: 'signed' });

        inRoom.close();
        inOtherRoom.close();
    });

    it('delivers to every client connected to the same room', async () => {
        const first = await connect('room_shared');
        const second = await connect('room_shared');

        const firstMessage = nextMessage(first);
        const secondMessage = nextMessage(second);
        notifyBattleRoom('room_shared', { type: 'battle-updated', battleId: 'btl_1', state: 'computed' });

        await expect(firstMessage).resolves.toEqual({ type: 'battle-updated', battleId: 'btl_1', state: 'computed' });
        await expect(secondMessage).resolves.toEqual({ type: 'battle-updated', battleId: 'btl_1', state: 'computed' });

        first.close();
        second.close();
    });

    it('does not throw when notifying a room with no connected clients', () => {
        expect(() => notifyBattleRoom('nobody-here', { type: 'battle-updated', battleId: 'btl_1', state: 'signed' })).not.toThrow();
    });

    it('notifyBattleRoomIfPresent is a no-op for a null roomId', () => {
        expect(() => notifyBattleRoomIfPresent(null, { type: 'battle-updated', battleId: 'btl_1', state: 'signed' })).not.toThrow();
    });

    it('stops delivering to a client after it disconnects', async () => {
        const socket = await connect('room_1');
        socket.close();
        await nextClose(socket);

        // No listener remains, so this must behave like the empty-room case above rather
        // than throwing on a stale reference.
        expect(() => notifyBattleRoom('room_1', { type: 'battle-updated', battleId: 'btl_1', state: 'signed' })).not.toThrow();
    });
});

describe('connection requirements', () => {
    it('closes the connection when roomId is missing', async () => {
        const socket = new WebSocket(baseUrl);
        const closed = nextClose(socket);
        const { code } = await closed;
        expect(code).toBe(1008);
    });
});
