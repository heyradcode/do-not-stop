import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@repositories/user.repository', () => ({
    getUser: vi.fn(),
    listUsers: vi.fn(),
}));

import { getUserProfile, listUsers } from '../../../src/features/protected/protected.service';
import { getUser, listUsers as listUserRows } from '@repositories/user.repository';

const now = new Date('2025-01-01T00:00:00Z');
const row = { address: '0xabc', createdAt: now, lastLogin: now };

beforeEach(() => { vi.clearAllMocks(); });

describe('getUserProfile', () => {
    it('returns mapped User when the row exists', async () => {
        vi.mocked(getUser).mockResolvedValue(row as never);
        const result = await getUserProfile('0xabc');
        expect(result).toMatchObject({
            address: '0xabc',
            createdAt: now.toISOString(),
            lastLogin: now.toISOString(),
        });
    });

    it('returns null when the user does not exist', async () => {
        vi.mocked(getUser).mockResolvedValue(null);
        expect(await getUserProfile('0xmissing')).toBeNull();
    });
});

describe('listUsers', () => {
    it('maps all rows to User objects with ISO date strings', async () => {
        vi.mocked(listUserRows).mockResolvedValue([row, { ...row, address: '0xdef' }] as never);
        const result = await listUsers();
        expect(result).toHaveLength(2);
        expect(result[0].createdAt).toBe(now.toISOString());
        expect(result[1].address).toBe('0xdef');
    });

    it('returns an empty array when no users exist', async () => {
        vi.mocked(listUserRows).mockResolvedValue([]);
        expect(await listUsers()).toEqual([]);
    });
});
