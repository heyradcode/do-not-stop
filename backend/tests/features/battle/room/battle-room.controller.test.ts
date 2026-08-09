import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../../../src/features/battle/room/battle-room.service', () => ({
    mintRoom: vi.fn(),
}));

import { createBattleRoom } from '../../../../src/features/battle/room/battle-room.controller';
import { mintRoom } from '../../../../src/features/battle/room/battle-room.service';

function makeRes() {
    const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    };
    return res as unknown as Response;
}

const validBody = { chain: 'evm', attackerPetId: 'p1', defenderPetId: 'p2' };

beforeEach(() => { vi.clearAllMocks(); });

describe('createBattleRoom', () => {
    it('returns 400 for an invalid request body', async () => {
        const res = makeRes();
        await createBattleRoom({ body: {} } as Request, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(mintRoom).not.toHaveBeenCalled();
    });

    it('returns 401 when the request has no authenticated user', async () => {
        const res = makeRes();
        await createBattleRoom({ body: validBody } as Request, res);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(mintRoom).not.toHaveBeenCalled();
    });

    it('mints a room for the authenticated wallet and returns its id', async () => {
        vi.mocked(mintRoom).mockResolvedValue('room-123');
        const res = makeRes();
        const req = { body: validBody, user: { address: '0xowner', userId: 'u1' } } as unknown as Request;
        await createBattleRoom(req, res);

        expect(mintRoom).toHaveBeenCalledWith(validBody, '0xowner');
        expect(res.json).toHaveBeenCalledWith({ roomId: 'room-123' });
    });

    it('returns 500 when the service throws', async () => {
        vi.mocked(mintRoom).mockRejectedValue(new Error('db down'));
        const res = makeRes();
        const req = { body: validBody, user: { address: '0xowner', userId: 'u1' } } as unknown as Request;
        await createBattleRoom(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
    });
});
