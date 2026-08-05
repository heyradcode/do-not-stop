import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@config/prisma', () => ({
    prisma: {
        user: {
            upsert: vi.fn(),
            findUnique: vi.fn(),
            findMany: vi.fn(),
            count: vi.fn(),
        },
    },
}));

import { upsertUser, getUser, listUsers, countUsers } from '../../../src/repositories/user.repository';
import { prisma } from '@config/prisma';

beforeEach(() => { vi.clearAllMocks(); });

describe('upsertUser', () => {
    it('upserts by address and returns the record', async () => {
        const record = { address: '0xabc', createdAt: new Date(), lastLogin: new Date() };
        vi.mocked(prisma.user.upsert).mockResolvedValue(record as never);
        const result = await upsertUser('0xabc');
        expect(result).toBe(record);
        expect(prisma.user.upsert).toHaveBeenCalledWith(
            expect.objectContaining({ where: { address: '0xabc' } }),
        );
    });
});

describe('getUser', () => {
    it('returns the user when found', async () => {
        const record = { address: '0xabc', createdAt: new Date(), lastLogin: new Date() };
        vi.mocked(prisma.user.findUnique).mockResolvedValue(record as never);
        expect(await getUser('0xabc')).toBe(record);
    });

    it('returns null when not found', async () => {
        vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
        expect(await getUser('0xmissing')).toBeNull();
    });
});

describe('listUsers', () => {
    it('returns all users ordered by createdAt', async () => {
        const rows = [{ address: '0xa' }, { address: '0xb' }];
        vi.mocked(prisma.user.findMany).mockResolvedValue(rows as never);
        expect(await listUsers()).toBe(rows);
        expect(prisma.user.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'asc' } });
    });
});

describe('countUsers', () => {
    it('returns the total user count', async () => {
        vi.mocked(prisma.user.count).mockResolvedValue(42);
        expect(await countUsers()).toBe(42);
    });
});
