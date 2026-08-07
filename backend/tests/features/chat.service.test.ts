import { describe, expect, it, vi, beforeEach } from 'vitest';

const findMarriedCounterparts = vi.fn();
const openThread = vi.fn();
const findThreadById = vi.fn();
const isMarriedTo = vi.fn();
const findMessages = vi.fn();
const findCounterpartReadId = vi.fn();
const markThreadRead = vi.fn();

vi.mock('@repositories/chat.repository', () => ({
    findMarriedCounterparts: (caller: string) => findMarriedCounterparts(caller),
    openThread: (x: string, y: string, scope: string) => openThread(x, y, scope),
    findThreadById: (id: string) => findThreadById(id),
    isMarriedTo: (a: string, b: string) => isMarriedTo(a, b),
    findMessages: (id: string, limit: number, before?: number) => findMessages(id, limit, before),
    findCounterpartReadId: (id: string, caller: string) => findCounterpartReadId(id, caller),
    markThreadRead: (id: string, participant: string, messageId: number) =>
        markThreadRead(id, participant, messageId),
    insertMessage: vi.fn(),
}));

import {
    authorizeThread,
    listThreads,
    markRead,
    readMessages,
} from '../../src/features/chat/chat.service';

const ME = '0x1111111111111111111111111111111111111111';
const THEM = '0x2222222222222222222222222222222222222222';

const marriage = (over: Record<string, unknown> = {}) => ({
    chain: 'evm',
    petId: '1',
    petName: 'Mine',
    spousePetId: '2',
    spouseName: 'Theirs',
    counterpart: THEM,
    ...over,
});

beforeEach(() => {
    vi.clearAllMocks();
    openThread.mockImplementation(async (x: string, y: string) => `thread-${x}-${y}`);
    isMarriedTo.mockResolvedValue(true);
});

describe('listThreads', () => {
    it('opens one thread per married counterpart', async () => {
        findMarriedCounterparts.mockResolvedValue([marriage()]);

        const threads = await listThreads(ME);

        expect(threads).toHaveLength(1);
        expect(threads[0].counterpart).toBe(THEM);
        expect(openThread).toHaveBeenCalledWith(ME, THEM, 'marriage');
    });

    it('collapses two married pet couples between the same owners into one thread', async () => {
        // The conversation is between the owners, not the pets. Two threads here would
        // split one relationship across two inboxes.
        findMarriedCounterparts.mockResolvedValue([
            marriage(),
            marriage({ petId: '3', petName: 'Second', spousePetId: '4', spouseName: 'Fourth' }),
        ]);

        const threads = await listThreads(ME);

        expect(threads).toHaveLength(1);
        expect(threads[0].pets).toHaveLength(2);
        expect(openThread).toHaveBeenCalledTimes(1);
    });

    it('returns nothing, and opens nothing, for an unmarried caller', async () => {
        findMarriedCounterparts.mockResolvedValue([]);

        expect(await listThreads(ME)).toEqual([]);
        expect(openThread).not.toHaveBeenCalled();
    });

    it('normalizes the counterpart, so a mixed-case roster owner is one participant', async () => {
        // indexer-go is not guaranteed to write the roster in the JWT's case; an
        // unnormalized counterpart would open a second thread for the same wallet.
        findMarriedCounterparts.mockResolvedValue([marriage({ counterpart: THEM.toUpperCase().replace('0X', '0x') })]);

        const threads = await listThreads(ME);

        expect(threads[0].counterpart).toBe(THEM);
        expect(openThread).toHaveBeenCalledWith(ME, THEM, 'marriage');
    });
});

describe('authorizeThread', () => {
    const thread = { id: 't1', participantA: ME, participantB: THEM, scope: 'marriage' };

    it('allows a participant whose marriage is live', async () => {
        findThreadById.mockResolvedValue(thread);
        findMarriedCounterparts.mockResolvedValue([marriage()]);

        expect(await authorizeThread('t1', ME)).toBeNull();
        expect(isMarriedTo).toHaveBeenCalledWith(ME, THEM);
    });

    it('refuses a wallet that is not a participant', async () => {
        findThreadById.mockResolvedValue(thread);

        const result = await authorizeThread('t1', '0x9999999999999999999999999999999999999999');

        expect(result).toBe('not-a-participant');
        // The marriage is not even consulted: not being in the thread settles it.
        expect(isMarriedTo).not.toHaveBeenCalled();
    });

    // The point of checking live state per request instead of recording it on the
    // thread: a divorce closes the conversation with nothing to revoke.
    it('refuses a participant whose marriage has ended', async () => {
        findThreadById.mockResolvedValue(thread);
        isMarriedTo.mockResolvedValue(false);

        expect(await authorizeThread('t1', ME)).toBe('not-married');
    });

    it('reports a missing thread', async () => {
        findThreadById.mockResolvedValue(null);

        expect(await authorizeThread('nope', ME)).toBe('not-found');
    });
});


describe('readMessages', () => {
    it('returns the page with how far the counterpart has read', async () => {
        findMessages.mockResolvedValue([{ id: 7 }]);
        findCounterpartReadId.mockResolvedValue(5);

        await expect(readMessages('t1', ME, 50)).resolves.toEqual({
            messages: [{ id: 7 }],
            readUpTo: 5,
        });
        expect(findCounterpartReadId).toHaveBeenCalledWith('t1', ME);
    });

    // Nobody has read anything yet is the common case on a new thread, and it has to read
    // as "no message is seen" rather than as a missing value at the call site.
    it('reports 0 when the counterpart has read nothing', async () => {
        findMessages.mockResolvedValue([]);
        findCounterpartReadId.mockResolvedValue(0);

        await expect(readMessages('t1', ME, 50)).resolves.toEqual({ messages: [], readUpTo: 0 });
    });
});

describe('markRead', () => {
    it("moves the caller's own watermark", async () => {
        markThreadRead.mockResolvedValue(undefined);

        await markRead('t1', ME, 9);

        expect(markThreadRead).toHaveBeenCalledWith('t1', ME, 9);
    });
});
