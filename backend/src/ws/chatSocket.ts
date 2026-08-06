import { defineChannel } from './channel';

/**
 * The per-thread notification channel for private chat (roadmap §2 v1).
 *
 * **Carries no message content, deliberately.** The roadmap assumed chat could reuse an
 * authenticated socket; there isn't one. The battle-room channel takes an id from the
 * query string and joins whoever asks, which is fine there because those notifications
 * carry nothing a client could not re-fetch anyway. Pushing message text down a channel
 * like that would hand private conversations to anyone holding a thread id.
 *
 * So this keeps the same posture and inherits its safety from it: the socket only ever
 * says "thread X changed", and the content comes from
 * `GET /api/chat/threads/:id/messages`, which authenticates the caller and rechecks the
 * marriage. A client that missed a notification, or never connected at all, learns
 * exactly the same thing by re-reading. This makes chat feel live; it is never the thing
 * that decides who may read it.
 *
 * What a listener does learn is *timing* — that a thread they know the id of had
 * activity. Thread ids are cuids handed out only by an authenticated read, so that
 * requires already having been told one. If v2 opens direct messages to strangers, this
 * channel should gain real authentication before it does, and the token belongs in a
 * subprotocol rather than the query string, where proxies and access logs would record it.
 */

export interface ChatThreadNotification {
    type: 'thread-updated';
    threadId: string;
    /** Id of the message that caused it, so a client can skip a re-read it already has. */
    messageId: number;
}

const channel = defineChannel('/ws/chat', 'threadId');

/** Tells everyone watching `threadId` that it changed. */
export function notifyChatThread(threadId: string, message: ChatThreadNotification): void {
    channel.notify(threadId, message);
}
