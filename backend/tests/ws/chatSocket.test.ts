import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import WebSocket from 'ws';

// The channel authorizes against the real service, so the marriage gate is stubbed while
// the JWT stays genuine — the token path is part of what these tests cover.
const authorizeThread = vi.fn();
vi.mock('@features/chat/chat.service', () => ({
    authorizeThread: (threadId: string, caller: string) => authorizeThread(threadId, caller),
}));

import '@ws/battleRoomSocket'; // registers the other channel, as the real server does
import { notifyChatThread } from '@ws/chatSocket';
import { startWsChannels, stopWsChannels } from '@ws/channel';

/**
 * Real server and real clients, because the property under test is delivery over the
 * wire: a listener on thread A must never receive thread B's notification, what arrives
 * must contain no message text, and an unauthorized client must not connect at all.
 */

const ME = '0x1111111111111111111111111111111111111111';
const THEM = '0x2222222222222222222222222222222222222222';
const AUTH_PROTOCOL = 'cryptopets-auth';

let server: Server;
let baseUrl: string;

const tokenFor = (address: string) =>
    jwt.sign({ address, userId: address }, process.env.JWT_SECRET as string, { expiresIn: '5m' });

beforeEach(async () => {
    vi.clearAllMocks();
    authorizeThread.mockResolvedValue(null); // a null denial means allowed
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

function connect(threadId: string | null, address = ME): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
        const url = threadId === null ? baseUrl : `${baseUrl}?threadId=${threadId}`;
        const socket = new WebSocket(url, [AUTH_PROTOCOL, tokenFor(address)]);
        socket.once('open', () => resolve(socket));
        socket.once('error', reject);
    });
}

/** The next frame that is not presence — presence arrives unprompted on join and leave. */
function nextUpdate(socket: WebSocket): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
        const onMessage = (data: Buffer) => {
            const message = JSON.parse(data.toString()) as Record<string, unknown>;
            if (message.type === 'presence') return;
            socket.off('message', onMessage);
            resolve(message);
        };
        socket.on('message', onMessage);
        socket.once('close', (code) => reject(new Error(`closed before a message: ${code}`)));
    });
}

function nextClose(socket: WebSocket): Promise<number> {
    return new Promise((resolve) => socket.once('close', (code) => resolve(code)));
}

/** Refusals happen at the upgrade, so they surface as an error rather than a close code. */
function outcomeOf(socket: WebSocket): Promise<string> {
    return new Promise((resolve) => {
        socket.once('open', () => resolve('open'));
        socket.once('error', () => resolve('refused'));
        socket.once('close', () => resolve('refused'));
    });
}

const update = { type: 'thread-updated', threadId: 'thread_1', messageId: 7 } as const;

describe('thread scoping', () => {
    it('delivers only to listeners on that thread', async () => {
        const onThread = await connect('thread_1');
        const onOther = await connect('thread_2');
        const otherMessage = nextUpdate(onOther);

        const received = nextUpdate(onThread);
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
        const first = await connect('thread_1', ME);
        const second = await connect('thread_1', THEM);
        const firstMessage = nextUpdate(first);
        const secondMessage = nextUpdate(second);

        notifyChatThread('thread_1', update);

        await expect(firstMessage).resolves.toEqual(update);
        await expect(secondMessage).resolves.toEqual(update);

        first.close();
        second.close();
    });

    // The safety argument for the channel: what it pushes is not readable content, so a
    // listener still has to pass the authenticated read.
    it('carries no message text', async () => {
        const socket = await connect('thread_1');
        const received = nextUpdate(socket);

        notifyChatThread('thread_1', update);

        expect(Object.keys(await received).sort()).toEqual(['messageId', 'threadId', 'type']);
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

describe('presence', () => {
    /** Records presence rosters as they arrive. */
    function presenceLog(socket: WebSocket): string[][] {
        const seen: string[][] = [];
        socket.on('message', (data: Buffer) => {
            const message = JSON.parse(data.toString()) as { type: string; online?: string[] };
            if (message.type === 'presence' && message.online) seen.push(message.online);
        });
        return seen;
    }

    const settle = () => new Promise((resolve) => setTimeout(resolve, 80));

    it('announces an arrival to whoever is already there', async () => {
        const first = await connect('thread_1', ME);
        const seen = presenceLog(first);
        await settle();

        const second = await connect('thread_1', THEM);
        await settle();

        // This is what turns the dot green without a reload.
        expect(seen.at(-1)).toEqual(expect.arrayContaining([ME, THEM]));

        first.close();
        second.close();
    });

    it('drops someone from the roster when they disconnect', async () => {
        const first = await connect('thread_1', ME);
        const second = await connect('thread_1', THEM);
        const seen = presenceLog(first);
        await settle();

        second.close();
        await settle();

        expect(seen.at(-1)).toEqual([ME]);
        first.close();
    });

    // Why presence counts identities rather than sockets: one person with two tabs open
    // must not look like two people, and closing one tab must not report them as gone.
    it('treats two connections from one wallet as one person', async () => {
        const first = await connect('thread_1', ME);
        const seen = presenceLog(first);
        const secondTab = await connect('thread_1', ME);
        await settle();

        expect(seen.at(-1)).toEqual([ME]);

        secondTab.close();
        await settle();
        expect(seen.at(-1)).toEqual([ME]);

        first.close();
    });
});

describe('connection requirements', () => {
    it('refuses a connection that names no thread', async () => {
        expect(await outcomeOf(new WebSocket(baseUrl, [AUTH_PROTOCOL, tokenFor(ME)]))).toBe(
            'refused'
        );
    });

    it('refuses a connection with no token', async () => {
        expect(await outcomeOf(new WebSocket(`${baseUrl}?threadId=thread_1`))).toBe('refused');
        expect(authorizeThread).not.toHaveBeenCalled();
    });

    it('refuses a connection with a forged token', async () => {
        const forged = jwt.sign({ address: ME, userId: ME }, 'not-the-secret');
        const socket = new WebSocket(`${baseUrl}?threadId=thread_1`, [AUTH_PROTOCOL, forged]);

        expect(await outcomeOf(socket)).toBe('refused');
        // Rejected on the signature, before the marriage gate is even consulted.
        expect(authorizeThread).not.toHaveBeenCalled();
    });

    // Authenticated but not a participant: the same gate the HTTP routes apply, so a
    // socket can never subscribe to a thread its holder could not read.
    it('refuses a valid token for a thread the caller is not in', async () => {
        authorizeThread.mockResolvedValue('not-a-participant');
        const socket = new WebSocket(`${baseUrl}?threadId=thread_1`, [AUTH_PROTOCOL, tokenFor(ME)]);

        expect(await outcomeOf(socket)).toBe('refused');
        expect(authorizeThread).toHaveBeenCalledWith('thread_1', ME);
    });
});
