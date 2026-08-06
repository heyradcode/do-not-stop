import type { IncomingMessage } from 'node:http';
import jwt from 'jsonwebtoken';

import { env } from '@config/env';
// Imported from the module, not the feature barrel: the barrel also exports the
// controller, which imports this file, and that would be a cycle.
import { authorizeThread } from '@features/chat/chat.service';
import { AUTH_PROTOCOL, defineChannel } from './channel';

/**
 * The per-thread channel for private chat (roadmap §2 v1).
 *
 * **Carries no message content.** The socket only ever says "thread X changed" plus who
 * is currently connected; the text comes from `GET /api/chat/threads/:id/messages`, which
 * authenticates the caller and rechecks the marriage. A client that missed a notification,
 * or never connected, learns the same thing by re-reading. This makes chat feel live; it
 * is never the thing that decides who may read it.
 *
 * Unlike the battle-room channel, this one **authenticates the upgrade**. Presence forced
 * it: "is my counterpart online" is a question about identities, and an anonymous socket
 * has none — counting connections would report one person with two tabs open as two
 * people. Authenticating also closes the timing leak the earlier version accepted, where
 * anyone holding a thread id could watch a conversation's activity without being in it.
 *
 * The token arrives as a WebSocket subprotocol rather than a query parameter, because
 * browsers cannot set headers on a WebSocket and a URL-borne JWT ends up in proxy and
 * access logs.
 *
 * Authorization is checked at connect only. A marriage that ends mid-session leaves the
 * socket open until it drops, which costs nothing: every frame is contentless, and the
 * read endpoint it prompts refuses immediately.
 */

export interface ChatThreadNotification {
    type: 'thread-updated';
    threadId: string;
    /** Id of the message that caused it, so a client can skip a re-read it already has. */
    messageId: number;
}

/** Who is connected to a thread right now. */
export interface ChatPresenceNotification {
    type: 'presence';
    topic: string;
    /** Wallet addresses currently connected, normalized as the thread stores them. */
    online: string[];
}

/**
 * Reads the token from the offered subprotocols.
 *
 * The client offers `[AUTH_PROTOCOL, <token>]`; the server echoes only the marker back.
 */
function tokenFromRequest(request: IncomingMessage): string | null {
    const offered = request.headers['sec-websocket-protocol'];
    if (!offered) return null;
    const values = (Array.isArray(offered) ? offered.join(',') : offered)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    const marker = values.indexOf(AUTH_PROTOCOL);
    return marker === -1 ? null : (values[marker + 1] ?? null);
}

const channel = defineChannel('/ws/chat', 'threadId', {
    presence: true,
    async authorize(request, threadId) {
        const token = tokenFromRequest(request);
        if (!token) return null;

        let address: string;
        try {
            ({ address } = jwt.verify(token, env.jwtSecret) as { address: string });
        } catch {
            return null;
        }
        if (!address) return null;

        // The same gate the HTTP routes apply, so a socket can never be subscribed to a
        // thread its holder could not read.
        return (await authorizeThread(threadId, address)) === null ? address : null;
    },
});

/** Tells everyone watching `threadId` that it changed. */
export function notifyChatThread(threadId: string, message: ChatThreadNotification): void {
    channel.notify(threadId, message);
}
