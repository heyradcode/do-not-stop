import { describe, expect, it, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { verifyToken } from '@middleware/auth';
import type { Request, Response, NextFunction } from 'express';

const SECRET = 'test-secret';

function makeRes() {
    const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    } as unknown as Response<{ error: string }>;
    return res;
}

function makeReq(token?: string): Request {
    return {
        headers: token ? { authorization: `Bearer ${token}` } : {},
    } as unknown as Request;
}

describe('verifyToken middleware', () => {
    const next: NextFunction = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('responds 401 when no Authorization header is present', () => {
        const req = makeReq();
        const res = makeRes();
        verifyToken(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'No token provided' });
        expect(next).not.toHaveBeenCalled();
    });

    it('calls next and attaches user when token is valid', () => {
        const payload = { address: '0xabc', userId: 'user1' };
        const token = jwt.sign(payload, SECRET);
        const req = makeReq(token);
        const res = makeRes();
        verifyToken(req, res, next);
        expect(next).toHaveBeenCalledOnce();
        expect((req as { user?: unknown }).user).toMatchObject(payload);
    });

    it('responds 401 when token is invalid', () => {
        const req = makeReq('not.a.valid.token');
        const res = makeRes();
        verifyToken(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
        expect(next).not.toHaveBeenCalled();
    });

    it('responds 401 when token is signed with the wrong secret', () => {
        const token = jwt.sign({ address: '0xabc', userId: 'u1' }, 'wrong-secret');
        const req = makeReq(token);
        const res = makeRes();
        verifyToken(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });
});
