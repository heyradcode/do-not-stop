import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../../src/features/protected/protected.service', () => ({
    getUserProfile: vi.fn(),
    listUsers: vi.fn(),
}));

import { getProfile, getUsers } from '../../../src/features/protected/protected.controller';
import { getUserProfile, listUsers } from '../../../src/features/protected/protected.service';

function makeRes() {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    return res as unknown as Response;
}

const userShape = { address: '0xabc', createdAt: '2025-01-01T00:00:00.000Z', lastLogin: '2025-01-01T00:00:00.000Z' };

beforeEach(() => { vi.clearAllMocks(); });

describe('getProfile', () => {
    it('returns 404 when the user does not exist', async () => {
        vi.mocked(getUserProfile).mockResolvedValue(null);
        const req = { user: { address: '0xabc' } } as unknown as Request;
        const res = makeRes();
        await getProfile(req, res);
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
    });

    it('returns the user profile when found', async () => {
        vi.mocked(getUserProfile).mockResolvedValue(userShape);
        const req = { user: { address: '0xabc' } } as unknown as Request;
        const res = makeRes();
        await getProfile(req, res);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('returns 500 when the service throws', async () => {
        vi.mocked(getUserProfile).mockRejectedValue(new Error('db down'));
        const req = { user: { address: '0xabc' } } as unknown as Request;
        const res = makeRes();
        await getProfile(req, res);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});

describe('getUsers', () => {
    it('returns the user list and total', async () => {
        vi.mocked(listUsers).mockResolvedValue([userShape]);
        const res = makeRes();
        await getUsers({} as Request, res);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: true, total: 1 }),
        );
    });

    it('returns 500 when the service throws', async () => {
        vi.mocked(listUsers).mockRejectedValue(new Error('db down'));
        const res = makeRes();
        await getUsers({} as Request, res);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});
