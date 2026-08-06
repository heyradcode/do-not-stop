import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/features/chat/chat.service', () => ({
    listThreads: vi.fn(),
    authorizeThread: vi.fn(),
    readMessages: vi.fn(),
    sendMessage: vi.fn(),
}));
vi.mock('@ws/chatSocket', () => ({ notifyChatThread: vi.fn() }));

import { getMessages, getThreads, postMessage } from '../../src/features/chat/chat.controller';
import {
    authorizeThread,
    listThreads,
    readMessages,
    sendMessage,
} from '../../src/features/chat/chat.service';
import { notifyChatThread } from '@ws/chatSocket';

function makeRes() {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    return res as unknown as Response;
}

const ME = '0x1111111111111111111111111111111111111111';

/** An authenticated request for thread `t1`. */
function req(over: Record<string, unknown> = {}): Request {
    return {
        params: { id: 't1' },
        query: {},
        body: {},
        user: { address: ME, userId: 'u1' },
        ...over,
    } as unknown as Request;
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authorizeThread).mockResolvedValue({ denial: null, counterpart: '0xthem' });
});

describe('getThreads', () => {
    it('lists threads for the session wallet', async () => {
        vi.mocked(listThreads).mockResolvedValue([]);
        const res = makeRes();

        await getThreads(req(), res);

        expect(listThreads).toHaveBeenCalledWith(ME);
        expect(res.json).toHaveBeenCalledWith({ threads: [] });
    });

    it('returns 401 without an authenticated user', async () => {
        const res = makeRes();
        await getThreads(req({ user: undefined }), res);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(listThreads).not.toHaveBeenCalled();
    });
});

describe('thread authorization', () => {
    // A non-participant must not be able to tell an existing thread id from a made-up
    // one; 403 here would confirm the id for anyone probing.
    it('answers 404, not 403, for a wallet that is not a participant', async () => {
        vi.mocked(authorizeThread).mockResolvedValue({ denial: 'not-a-participant' });
        const res = makeRes();

        await getMessages(req(), res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(readMessages).not.toHaveBeenCalled();
    });

    it('answers 404 for a thread that does not exist', async () => {
        vi.mocked(authorizeThread).mockResolvedValue({ denial: 'not-found' });
        const res = makeRes();

        await getMessages(req(), res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    // A participant already knows the thread exists, so an ended marriage can say so.
    it('answers 403 with a reason when the marriage has ended', async () => {
        vi.mocked(authorizeThread).mockResolvedValue({ denial: 'not-married' });
        const res = makeRes();

        await postMessage(req({ body: { text: 'hi' } }), res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(sendMessage).not.toHaveBeenCalled();
    });
});

describe('getMessages', () => {
    it('passes the page through after authorizing', async () => {
        vi.mocked(readMessages).mockResolvedValue([]);
        const res = makeRes();

        await getMessages(req({ query: { limit: '10', before: '99' } }), res);

        expect(readMessages).toHaveBeenCalledWith('t1', 10, 99);
    });

    it('rejects a bad page size before touching the database', async () => {
        const res = makeRes();

        await getMessages(req({ query: { limit: '5000' } }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(readMessages).not.toHaveBeenCalled();
    });
});

describe('postMessage', () => {
    it('stores the trimmed text under the session wallet', async () => {
        vi.mocked(sendMessage).mockResolvedValue({
            id: 1,
            sender: ME,
            text: 'hello',
            createdAt: new Date(0),
        });
        const res = makeRes();

        await postMessage(req({ body: { text: '  hello  ' } }), res);

        expect(sendMessage).toHaveBeenCalledWith('t1', ME, 'hello');
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it('rejects a message that is only whitespace', async () => {
        const res = makeRes();

        await postMessage(req({ body: { text: '   ' } }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(sendMessage).not.toHaveBeenCalled();
    });

    it('rejects a message past the length cap', async () => {
        const res = makeRes();

        await postMessage(req({ body: { text: 'x'.repeat(2001) } }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(sendMessage).not.toHaveBeenCalled();
    });

    it('notifies the thread after the write, carrying the id and no text', async () => {
        vi.mocked(sendMessage).mockResolvedValue({
            id: 42,
            sender: ME,
            text: 'hello',
            createdAt: new Date(0),
        });

        await postMessage(req({ body: { text: 'hello' } }), makeRes());

        expect(notifyChatThread).toHaveBeenCalledWith('t1', {
            type: 'thread-updated',
            threadId: 't1',
            messageId: 42,
        });
    });

    it('does not notify when the write was refused', async () => {
        vi.mocked(authorizeThread).mockResolvedValue({ denial: 'not-married' });

        await postMessage(req({ body: { text: 'hello' } }), makeRes());

        expect(notifyChatThread).not.toHaveBeenCalled();
    });

    it('cannot send as another wallet by putting one in the body', async () => {
        vi.mocked(sendMessage).mockResolvedValue({
            id: 1,
            sender: ME,
            text: 'hi',
            createdAt: new Date(0),
        });
        const res = makeRes();

        await postMessage(req({ body: { text: 'hi', sender: '0xsomeone-else' } }), res);

        expect(sendMessage).toHaveBeenCalledWith('t1', ME, 'hi');
    });
});
