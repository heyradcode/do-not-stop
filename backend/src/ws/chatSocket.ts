import type { Server } from 'node:http';
import { URL } from 'node:url';

// Named import for the same reason `battleRoomSocket` uses one: `ws`'s ESM entry exposes
// the server class only as `WebSocketServer`, with no `.Server` static.
import WebSocket, { WebSocketServer } from 'ws';

/**
 * The per-thread notification channel for private chat (roadmap §2 v1).
 *
 * **Carries no message content, deliberately.** The roadmap assumed chat could reuse an
 * authenticated socket; there isn't one. `battleRoomSocket` — the channel §2 pointed at,
 * under its old name — takes an id from the query string and joins whoever asks, which
 * is fine for battle updates because those carry nothing a client could not re-fetch
 * anyway. Pushing message text down a channel like that would hand private conversations
 * to anyone holding a thread id.
 *
 * So this keeps the same posture and inherits its safety from it: the socket only ever
 * says "thread X changed", and the content comes from `GET /api/chat/threads/:id/messages`,
 * which authenticates the caller and rechecks the marriage. A client that missed a
 * notification, or never connected at all, learns exactly the same thing by re-reading.
 * This makes chat feel live; it is never the thing that decides who may read it.
 *
 * What a listener does learn is *timing* — that a thread they know the id of had activity.
 * Thread ids are cuids handed out only by an authenticated read, so that requires already
 * having been told one. If v2 opens direct messages to strangers, this channel should gain
 * real authentication before it does, and the token belongs in a subprotocol rather than
 * the query string, where proxies and access logs would record it.
 *
 * Deliberately a separate file from `battleRoomSocket` rather than a shared abstraction
 * over the two. The membership bookkeeping is the same today, but the two channels are
 * heading different places — this one needs per-listener authorization the moment its
 * scope widens, and that is exactly the seam a premature shared helper would fuse shut.
 */

export interface ChatThreadNotification {
    type: 'thread-updated';
    threadId: string;
    /** Id of the message that caused it, so a client can skip a re-read it already has. */
    messageId: number;
}

let wss: WebSocketServer | null = null;
const threadListeners = new Map<string, Set<WebSocket>>();

export function startChatSocket(server: Server): void {
    wss = new WebSocketServer({ server, path: '/ws/chat' });
    wss.on('connection', (socket, request) => {
        const threadId = threadIdFromUrl(request.url);
        if (!threadId) {
            socket.close(1008, 'threadId query parameter is required');
            return;
        }
        join(threadId, socket);
        socket.on('close', () => leave(threadId, socket));
    });
    console.log('[chat-ws] listening on /ws/chat');
}

export function stopChatSocket(): void {
    wss?.close();
    wss = null;
    threadListeners.clear();
}

/**
 * Tells everyone watching `threadId` that it changed.
 *
 * A no-op when nobody is listening, which is the normal case: most messages are sent to
 * someone who is not looking at the app. Delivery here is an optimization, so a missed
 * notification is not a failure worth surfacing — the recipient sees the message on their
 * next read either way.
 */
export function notifyChatThread(threadId: string, message: ChatThreadNotification): void {
    const listeners = threadListeners.get(threadId);
    if (!listeners || listeners.size === 0) return;
    const payload = JSON.stringify(message);
    for (const client of listeners) {
        if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
}

function join(threadId: string, socket: WebSocket): void {
    let listeners = threadListeners.get(threadId);
    if (!listeners) {
        listeners = new Set();
        threadListeners.set(threadId, listeners);
    }
    listeners.add(socket);
}

function leave(threadId: string, socket: WebSocket): void {
    const listeners = threadListeners.get(threadId);
    if (!listeners) return;
    listeners.delete(socket);
    if (listeners.size === 0) threadListeners.delete(threadId);
}

function threadIdFromUrl(url: string | undefined): string | null {
    if (!url) return null;
    try {
        // The base is discarded; WHATWG URL just needs an absolute one to parse against.
        return new URL(url, 'http://internal').searchParams.get('threadId');
    } catch {
        return null;
    }
}
