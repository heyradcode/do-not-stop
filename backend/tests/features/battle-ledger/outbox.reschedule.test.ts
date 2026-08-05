import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/prisma', () => ({
    prisma: { battleOutbox: { update: vi.fn() } },
}));

import { prisma } from '@config/prisma';
import { rescheduleOutbox } from '@features/battle-ledger';

beforeEach(() => {
    vi.clearAllMocks();
});

describe('rescheduleOutbox', () => {
    it('moves availableAt and releases the lock without touching attempts or lastError', async () => {
        // Waiting for a drand round is the expected case, not a failure: applying
        // failOutbox's backoff-then-dead-letter here would eventually dead-letter a perfectly
        // healthy battle just because its round has not published yet.
        const availableAt = new Date('2026-07-26T12:00:00.000Z');
        await rescheduleOutbox('msg_1', availableAt);

        expect(vi.mocked(prisma.battleOutbox.update).mock.calls[0]![0]).toEqual({
            where: { id: 'msg_1' },
            data: { availableAt, lockedAt: null, lockedBy: null },
        });
    });
});
