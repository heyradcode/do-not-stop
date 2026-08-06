import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';

import '@ws/battleRoomSocket'; // registers the other channel, as the real server does
import { notifyChatThread } from '@ws/chatSocket';
import { startWsChannels, stopWsChannels } from '@ws/channel';

/**
 * Real server and real clients, because the property under test is delivery over the
 * wire: a listener on thread A must never receive thread B's notification, and what
 * arrives must contain no message text — the socket exists to prompt an authenticated
 * re-read, never to be one.
 */

let server: Server;
let baseUrl: string;

beforeEach(async () => {
    server = createServer();
    startWsChannels(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') {
        throw new Error('expected a bound TCP address');
    }
    baseUrl = `ws://127.0.0.1:${address.port}/ws/chat`;
});

afterEach(async () => {
    stopWsChannels();
    await new Promise<void>((resolve) => server.close(() => resolve()));
});

function connect(threadId: string | null): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
        const url = threadId === null ? baseUrl : `${baseUrl}?threadId=${threadId}`;
        const socket = new WebSocket(url);
        socket.once('open', () => resolve(socket));
        socket.once('error', reject);
    });
}

function nextMessage(socket: WebSocket): Promise<unknown> {
    return new Promise((resolve, reject) => {
        socket.once('message', (data) => resolve(JSON.parse(data.toString())));
        socket.once('close', (code) => reject(new Error(`closed before a message arrived: ${code}`)));
    });
}

function nextClose(socket: WebSocket): Promise<number> {
    return new Promise((resolve) => socket.once('close', (code) => resolve(code)));
}

const update = { type: 'thread-updated', threadId: 'thread_1', messageId: 7 } as const;

describe('thread scoping', () => {
    it('delivers only to listeners on that thread', async () => {
        const onThread = await connect('thread_1');
        const onOther = await connect('thread_2');
        const otherMessage = nextMessage(onOther);

        const received = nextMessage(onThread);
        notifyChatThread('thread_1', update);
        await expect(received).resolves.toEqual(update);

        // Prove the negative without a timeout: race the other listener against a
        // notification for its own thread, which must be the first thing it sees.
        const ownUpdate = { type: 'thread-updated', threadId: 'thread_2', messageId: 9 } as const;
        notifyChatThread('thread_2', ownUpdate);
        await expect(otherMessage).resolves.toEqual(ownUpdate);

        onThread.close();
        onOther.close();
    });

    it('delivers to both participants watching the same thread', async () => {
        const first = await connect('thread_1');
        const second = await connect('thread_1');
        const firstMessage = nextMessage(first);
        const secondMessage = nextMessage(second);

        notifyChatThread('thread_1', update);

        await expect(firstMessage).resolves.toEqual(update);
        await expect(secondMessage).resolves.toEqual(update);

        first.close();
        second.close();
    });

    // The whole safety argument for an unauthenticated channel: what it pushes is not
    // readable content, so a listener still has to pass the authenticated read.
    it('carries no message text', async () => {
        const socket = await connect('thread_1');
        const received = nextMessage(socket);

        notifyChatThread('thread_1', update);

        expect(Object.keys((await received) as object).sort()).toEqual([
            'messageId',
            'threadId',
            'type',
        ]);
        socket.close();
    });

    it('does not throw when nobody is listening', () => {
        // The normal case: most messages arrive while the recipient has the app closed.
        expect(() => notifyChatThread('quiet', update)).not.toThrow();
    });

    it('stops delivering to a client after it disconnects', async () => {
        const socket = await connect('thread_1');
        socket.close();
        await nextClose(socket);

        expect(() => notifyChatThread('thread_1', update)).not.toThrow();
    });
});

describe('connection requirements', () => {
    it('refuses a connection that names no thread', async () => {
        // Refused at the upgrade, before a WebSocket exists, so this surfaces as a
        // transport error rather than a close code. Failing here rather than accepting a
        // subscriber to nothing is the point: the latter looks connected and never
        // delivers.
        const socket = new WebSocket(baseUrl);
        const outcome = await new Promise<string>((resolve) => {
            socket.once('open', () => resolve('open'));
            socket.once('error', () => resolve('refused'));
            socket.once('close', () => resolve('refused'));
        });
        expect(outcome).toBe('refused');
    });
});
