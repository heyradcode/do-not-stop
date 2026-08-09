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
 * A channel may declare an authorizer. Without one it stays open to anyone who knows a
 * topic id, which is acceptable only while its frames carry nothing readable — the
 * battle-room channel's position. Chat has one, because presence is a claim about
 * *identities* and an anonymous socket has none.
 */

/** Marker subprotocol; the token rides alongside it as the second offered value. */
export const AUTH_PROTOCOL = 'cryptopets-auth';

/**
 * Decides whether a connection may subscribe, and who it belongs to.
 *
 * Returns the subscriber's identity (a wallet address) to accept, or null to refuse
 * before the handshake, so a rejected client never becomes a subscriber at all — not
 * even to the fact that the topic changed.
 */
export type ChannelAuthorizer = (
    request: IncomingMessage,
    topic: string
) => Promise<string | null>;

export interface ChannelOptions {
    authorize?: ChannelAuthorizer;
    /** Broadcast who is connected to a topic. Requires `authorize`. */
    presence?: boolean;
}

interface Channel {
    /** Path this channel answers on, e.g. `/ws/chat`. */
    path: string;
    /** Query parameter naming the topic a client subscribes to, e.g. `threadId`. */
    param: string;
    authorize?: ChannelAuthorizer;
    presence: boolean;
    /** topic → connected sockets. */
    members: Map<string, Set<WebSocket>>;
    /** topic → identity → open connection count, so two tabs are one person. */
    present: Map<string, Map<string, number>>;
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

export function defineChannel(
    path: string,
    param: string,
    options: ChannelOptions = {}
): ChannelHandle {
    if (options.presence && !options.authorize) {
        // A guard rather than a silent degradation: presence over anonymous sockets can
        // only say "somebody is here", and one person with two tabs open would read as
        // their counterpart being online.
        throw new Error(`channel ${path}: presence requires an authorizer`);
    }

    const channel: Channel = {
        path,
        param,
        members: new Map(),
        present: new Map(),
        wss: null,
        presence: options.presence ?? false,
        ...(options.authorize ? { authorize: options.authorize } : {}),
    };
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
        channel.wss = new WebSocketServer({
            noServer: true,
            // Browsers cannot set headers on a WebSocket, so a token travels as a
            // subprotocol. The marker is echoed back, never the token; a query parameter
            // would put the JWT into proxy and access logs.
            handleProtocols: (protocols) => (protocols.has(AUTH_PROTOCOL) ? AUTH_PROTOCOL : false),
        });
        channel.wss.on(
            'connection',
            (socket: WebSocket, _req: IncomingMessage, topic: string, identity: string | null) => {
                join(channel, topic, socket, identity);
                socket.on('close', () => leave(channel, topic, socket, identity));
            }
        );
    }

    const onUpgrade: UpgradeListener = (request, socket, head) => {
        const url = parseUrl(request.url);
        const channel = url
            ? channels.find((candidate) => candidate.path === url.pathname)
            : undefined;
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

        const wss = channel.wss;
        const authorize = channel.authorize;
        if (!authorize) {
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request, topic, null);
            });
            return;
        }

        void (async () => {
            let identity: string | null = null;
            try {
                identity = await authorize(request, topic);
            } catch (err) {
                console.error(`[ws] authorize threw for ${channel.path}:`, err);
            }
            if (!identity) {
                socket.destroy();
                return;
            }
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request, topic, identity);
            });
        })();
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
        channel.present.clear();
    }
}

function join(
    channel: Channel,
    topic: string,
    socket: WebSocket,
    identity: string | null
): void {
    let listeners = channel.members.get(topic);
    if (!listeners) {
        listeners = new Set();
        channel.members.set(topic, listeners);
    }
    listeners.add(socket);

    if (channel.presence && identity) {
        const counts = channel.present.get(topic) ?? new Map<string, number>();
        counts.set(identity, (counts.get(identity) ?? 0) + 1);
        channel.present.set(topic, counts);
        broadcastPresence(channel, topic);
    } else if (channel.presence) {
        // Still tell the newcomer who is already here; the broadcast above only fires for
        // an identified join, and a client that connected to silence would show everyone
        // offline until the next arrival.
        sendPresence(channel, topic, socket);
    }
}

function leave(
    channel: Channel,
    topic: string,
    socket: WebSocket,
    identity: string | null
): void {
    const listeners = channel.members.get(topic);
    if (listeners) {
        listeners.delete(socket);
        if (listeners.size === 0) channel.members.delete(topic);
    }

    if (channel.presence && identity) {
        const counts = channel.present.get(topic);
        if (counts) {
            // Counted, not a set: closing one of two tabs must not report someone as gone.
            const remaining = (counts.get(identity) ?? 1) - 1;
            if (remaining > 0) counts.set(identity, remaining);
            else counts.delete(identity);
            if (counts.size === 0) channel.present.delete(topic);
        }
        broadcastPresence(channel, topic);
    }
}

/** The current roster of a topic, as a frame. */
function presenceFrame(channel: Channel, topic: string): string {
    const online = [...(channel.present.get(topic)?.keys() ?? [])];
    return JSON.stringify({ type: 'presence', topic, online });
}

/**
 * Tells everyone on a topic who is currently connected.
 *
 * Only participants can be connected at all (presence requires an authorizer), so these
 * identities are already known to everyone receiving them.
 */
function broadcastPresence(channel: Channel, topic: string): void {
    const listeners = channel.members.get(topic);
    if (!listeners || listeners.size === 0) return;
    const payload = presenceFrame(channel, topic);
    for (const client of listeners) {
        if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
}

function sendPresence(channel: Channel, topic: string, socket: WebSocket): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(presenceFrame(channel, topic));
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
