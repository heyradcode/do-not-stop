import type { Request, Response } from 'express';

import type { AuthenticatedRequest } from '@middleware/auth';
import { notifyChatThread } from '@ws/chatSocket';
import {
    authorizeThread,
    listThreads,
    markRead,
    readMessages,
    sendMessage,
    type ChatDenial,
} from './chat.service';
import { ListMessagesSchema, MarkReadSchema, SendMessageSchema } from './chat.schema';

/**
 * HTTP surface for private chat (roadmap §2 v1). Every route is JWT-gated at the
 * router; the caller is always the session wallet and never a request field.
 */

/** GET /api/chat/threads — the caller's currently-usable threads. */
export async function getThreads(req: Request, res: Response): Promise<void> {
    const caller = callerOf(req);
    if (!caller) {
        res.status(401).json({ error: 'No token provided' });
        return;
    }

    try {
        res.json({ threads: await listThreads(caller) });
    } catch (err) {
        console.error('[chat] failed to list threads:', err);
        res.status(500).json({ error: 'Failed to list chat threads' });
    }
}

/** GET /api/chat/threads/:id/messages — a page, oldest first, newest page by default. */
export async function getMessages(req: Request, res: Response): Promise<void> {
    const caller = callerOf(req);
    if (!caller) {
        res.status(401).json({ error: 'No token provided' });
        return;
    }

    const query = ListMessagesSchema.safeParse(req.query);
    if (!query.success) {
        res.status(400).json({ error: 'Invalid pagination' });
        return;
    }

    const threadId = req.params.id ?? '';
    const denial = await authorizeThread(threadId, caller);
    if (denial) {
        respondToDenial(res, denial);
        return;
    }

    try {
        res.json(await readMessages(threadId, caller, query.data.limit, query.data.before));
    } catch (err) {
        console.error('[chat] failed to read messages:', err);
        res.status(500).json({ error: 'Failed to read messages' });
    }
}

/** POST /api/chat/threads/:id/read — move the caller's read watermark. */
export async function postRead(req: Request, res: Response): Promise<void> {
    const caller = callerOf(req);
    if (!caller) {
        res.status(401).json({ error: 'No token provided' });
        return;
    }

    const body = MarkReadSchema.safeParse(req.body);
    if (!body.success) {
        res.status(400).json({ error: 'Invalid message id' });
        return;
    }

    const threadId = req.params.id ?? '';
    const denial = await authorizeThread(threadId, caller);
    if (denial) {
        respondToDenial(res, denial);
        return;
    }

    try {
        await markRead(threadId, caller, body.data.messageId);
        // The sender is watching for their tick to fill in. Contentless like every other
        // frame on this channel: it says the thread changed, and the client re-reads.
        notifyChatThread(threadId, {
            type: 'thread-read',
            threadId,
            messageId: body.data.messageId,
        });
        res.status(204).end();
    } catch (err) {
        console.error('[chat] failed to mark read:', err);
        res.status(500).json({ error: 'Failed to mark read' });
    }
}

/** POST /api/chat/threads/:id/messages — append one message. */
export async function postMessage(req: Request, res: Response): Promise<void> {
    const caller = callerOf(req);
    if (!caller) {
        res.status(401).json({ error: 'No token provided' });
        return;
    }

    const body = SendMessageSchema.safeParse(req.body);
    if (!body.success) {
        res.status(400).json({ error: 'Message must be between 1 and 2000 characters' });
        return;
    }

    const threadId = req.params.id ?? '';
    const denial = await authorizeThread(threadId, caller);
    if (denial) {
        respondToDenial(res, denial);
        return;
    }

    try {
        const message = await sendMessage(threadId, caller, body.data.text);
        // After the write, never instead of it: the message is already durable, so a
        // failure to notify costs liveness, not the message. Carries no text — see
        // `chatSocket`.
        notifyChatThread(threadId, {
            type: 'thread-updated',
            threadId,
            messageId: message.id,
        });
        res.status(201).json({ message });
    } catch (err) {
        console.error('[chat] failed to send message:', err);
        res.status(500).json({ error: 'Failed to send message' });
    }
}

function callerOf(req: Request): string | undefined {
    return (req as AuthenticatedRequest).user?.address;
}

/**
 * A non-participant gets 404, not 403.
 *
 * 403 would confirm that a thread with that id exists, which is exactly what someone
 * probing ids wants to learn. "Not yours" and "not there" are the same answer to
 * anyone who is not a participant. An ended marriage does get its own status, because
 * that caller is a participant and has already been told the thread exists.
 */
function respondToDenial(res: Response, denial: ChatDenial): void {
    if (denial === 'not-married') {
        res.status(403).json({
            error: 'This conversation is open only while your pets are married',
        });
        return;
    }
    res.status(404).json({ error: 'Thread not found' });
}
