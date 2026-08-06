import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { URL } from 'node:url';

// Named import for the same reason the channels use one: `ws`'s ESM entry exposes the
// server class only as `WebSocketServer`, with no `.Server` static.
import WebSocket, { WebSocketServer } from 'ws';

/**
 * One upgrade listener for every WebSocket channel this process serves.
 *
 * This exists because the obvious arrangement is broken. Constructing a
 * `WebSocketServer({ server, path })` per channel attaches *one upgrade listener per
 * instance* to the same HTTP server, and Node calls all of them for every upgrade — so
 * with two channels each connection is handled twice, the client receives two HTTP 101
 * responses, and the second one is parsed as a WebSocket frame. The visible symptom is
 * `RangeError: Invalid WebSocket frame: RSV1 must be clear`, and it takes down *both*
 * channels, not just the one added second.
 *
 * So the servers are constructed with `noServer: true` and this module owns the single
 * listener, dispatching on path. That is what the `ws` documentation recommends for
 * exactly this case.
 *
 * Every channel is notification-only by construction (see the two that use it): a frame
 * says "this thing changed, re-read it" and carries no content, which is what makes an
 * unauthenticated socket acceptable. A channel that ever wants to push content needs
 * authentication in `handleUpgrade` first.
 */

interface Channel {
    /** Path this channel answers on, e.g. `/ws/chat`. */
    path: string;
    /** Query parameter naming the topic a client subscribes to, e.g. `threadId`. */
    param: string;
    /** topic → connected sockets. */
    members: Map<string, Set<WebSocket>>;
    wss: WebSocketServer | null;
}

const channels: Channel[] = [];

/** A channel handle: register once at module load, start with the HTTP server later. */
export interface ChannelHandle {
    /**
     * Sends a message to everyone subscribed to `topic`.
     *
     * A no-op when nobody is listening, which is the normal case rather than a failure:
     * most notifications concern someone who does not have the app open. Delivery here is
     * an optimization over re-reading, never the authority for it.
     */
    notify(topic: string, message: unknown): void;
}

export function defineChannel(path: string, param: string): ChannelHandle {
    const channel: Channel = { path, param, members: new Map(), wss: null };
    channels.push(channel);

    return {
        notify(topic, message) {
            const listeners = channel.members.get(topic);
            if (!listeners || listeners.size === 0) return;
            const payload = JSON.stringify(message);
            for (const client of listeners) {
                if (client.readyState === WebSocket.OPEN) client.send(payload);
            }
        },
    };
}

/** The server and listener currently attached, so `stop` can detach precisely. */
let attached: { server: Server; onUpgrade: UpgradeListener } | null = null;

type UpgradeListener = (request: IncomingMessage, socket: Duplex, head: Buffer) => void;

/** Starts every defined channel against one HTTP server. */
export function startWsChannels(server: Server): void {
    // Starting twice would attach a second listener and reintroduce the double-handled
    // upgrade this module exists to prevent, so the previous one is always detached first.
    stopWsChannels();

    for (const channel of channels) {
        channel.wss = new WebSocketServer({ noServer: true });
        channel.wss.on('connection', (socket: WebSocket, _req: IncomingMessage, topic: string) => {
            join(channel, topic, socket);
            socket.on('close', () => leave(channel, topic, socket));
        });
    }

    const onUpgrade: UpgradeListener = (request, socket, head) => {
        const url = parseUrl(request.url);
        const channel = url ? channels.find((candidate) => candidate.path === url.pathname) : undefined;
        if (!url || !channel?.wss) {
            // Not ours. Destroying rather than ignoring, because with a single listener
            // there is nobody else to answer and a hanging socket would leak.
            socket.destroy();
            return;
        }

        const topic = url.searchParams.get(channel.param);
        if (!topic) {
            // Refused before the handshake: a client that names no topic would otherwise
            // sit connected receiving nothing, which reads as a silent failure.
            socket.destroy();
            return;
        }

        channel.wss.handleUpgrade(request, socket, head, (ws) => {
            channel.wss?.emit('connection', ws, request, topic);
        });
    };

    server.on('upgrade', onUpgrade);
    attached = { server, onUpgrade };

    console.log(`[ws] listening on ${channels.map((c) => c.path).join(', ')}`);
}

export function stopWsChannels(): void {
    attached?.server.off('upgrade', attached.onUpgrade);
    attached = null;

    for (const channel of channels) {
        channel.wss?.close();
        channel.wss = null;
        channel.members.clear();
    }
}

function join(channel: Channel, topic: string, socket: WebSocket): void {
    let listeners = channel.members.get(topic);
    if (!listeners) {
        listeners = new Set();
        channel.members.set(topic, listeners);
    }
    listeners.add(socket);
}

function leave(channel: Channel, topic: string, socket: WebSocket): void {
    const listeners = channel.members.get(topic);
    if (!listeners) return;
    listeners.delete(socket);
    if (listeners.size === 0) channel.members.delete(topic);
}

function parseUrl(url: string | undefined): URL | null {
    if (!url) return null;
    try {
        // The base is discarded; WHATWG URL just needs an absolute one to parse against.
        return new URL(url, 'http://internal');
    } catch {
        return null;
    }
}
