import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import WebSocket from 'ws';

// Chat authorizes its upgrades now; the battle room does not. Stubbing the marriage gate
// keeps this file about channel routing rather than about chat's rules.
vi.mock('@features/chat/chat.service', () => ({
    authorizeThread: vi.fn(async () => null),
}));

import { notifyBattleRoom } from '@ws/battleRoomSocket';
import { notifyChatThread } from '@ws/chatSocket';
import { startWsChannels, stopWsChannels } from '@ws/channel';

/**
 * The case the per-channel tests cannot see: both channels on **one** HTTP server, which
 * is what the real process runs.
 *
 * Each channel used to construct its own `WebSocketServer({ server, path })`, which
 * attaches one upgrade listener per instance. Node calls every listener for every
 * upgrade, so with two channels each connection was handled twice, the client received
 * two HTTP 101 responses, and the second was parsed as a frame —
 * `RangeError: Invalid WebSocket frame: RSV1 must be clear`. It broke *both* channels,
 * and every existing test passed because each gave its socket a private server.
 */

let server: Server;
let base: string;

beforeEach(async () => {
    server = createServer();
    startWsChannels(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') {
        throw new Error('expected a bound TCP address');
    }
    base = `ws://127.0.0.1:${address.port}`;
});

afterEach(async () => {
    stopWsChannels();
    await new Promise<void>((resolve) => server.close(() => resolve()));
});

const AUTH_PROTOCOL = 'cryptopets-auth';
const token = () =>
    jwt.sign(
        { address: '0x1111111111111111111111111111111111111111', userId: 'u' },
        process.env.JWT_SECRET as string,
        { expiresIn: '5m' },
    );

function open(url: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
        // The token is ignored by the unauthenticated channel and required by chat, so
        // both connections are opened the same way.
        const socket = new WebSocket(url, [AUTH_PROTOCOL, token()]);
        socket.once('open', () => resolve(socket));
        socket.once('error', reject);
    });
}

/** Skips presence frames, which chat emits unprompted on join. */
function nextMessage(socket: WebSocket): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
        const onMessage = (data: Buffer) => {
            const message = JSON.parse(data.toString()) as Record<string, unknown>;
            if (message.type === 'presence') return;
            socket.off('message', onMessage);
            resolve(message);
        };
        socket.on('message', onMessage);
        socket.once('error', reject);
        socket.once('close', (code) => reject(new Error(`closed before a message: ${code}`)));
    });
}

describe('two channels on one server', () => {
    it('accepts a connection on each path', async () => {
        const room = await open(`${base}/ws/battle-room?roomId=r1`);
        const chat = await open(`${base}/ws/chat?threadId=t1`);

        expect(room.readyState).toBe(WebSocket.OPEN);
        expect(chat.readyState).toBe(WebSocket.OPEN);

        room.close();
        chat.close();
    });

    it('delivers each channel its own traffic and never the other channel traffic', async () => {
        const room = await open(`${base}/ws/battle-room?roomId=r1`);
        const chat = await open(`${base}/ws/chat?threadId=t1`);
        const roomMessage = nextMessage(room);
        const chatMessage = nextMessage(chat);

        notifyChatThread('t1', { type: 'thread-updated', threadId: 't1', messageId: 1 });
        notifyBattleRoom('r1', { type: 'battle-updated', battleId: 'b1', state: 'signed' });

        // Each listener's first frame must be its own channel's: if the chat notification
        // reached the room listener, this resolves to the wrong shape rather than timing
        // out, so the assertion catches cross-talk directly.
        await expect(chatMessage).resolves.toMatchObject({ type: 'thread-updated' });
        await expect(roomMessage).resolves.toMatchObject({ type: 'battle-updated' });

        room.close();
        chat.close();
    });

    it('refuses an unknown path without disturbing the known ones', async () => {
        await expect(open(`${base}/ws/nope?roomId=r1`)).rejects.toThrow();

        const chat = await open(`${base}/ws/chat?threadId=t1`);
        expect(chat.readyState).toBe(WebSocket.OPEN);
        chat.close();
    });
});
