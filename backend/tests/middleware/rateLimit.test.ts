import { describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';

const captured = vi.hoisted(() => ({ keyGenerator: undefined as ((req: Request) => string) | undefined }));

vi.mock('express-rate-limit', () => ({
    rateLimit: vi.fn((opts?: { keyGenerator?: (req: Request) => string }) => {
        if (opts?.keyGenerator) captured.keyGenerator = opts.keyGenerator;
        return vi.fn();
    }),
    ipKeyGenerator: vi.fn((_ip: string) => `ip:${_ip}`),
}));

import { authRateLimit, dialogueRateLimit } from '../../src/middleware/rateLimit';

describe('rateLimit exports', () => {
    it('authRateLimit is a function (middleware)', () => {
        expect(typeof authRateLimit).toBe('function');
    });

    it('dialogueRateLimit is a function (middleware)', () => {
        expect(typeof dialogueRateLimit).toBe('function');
    });
});

describe('walletKey (via dialogueRateLimit keyGenerator)', () => {
    it('returns the wallet address when req.user.address is present', () => {
        const req = { user: { address: '0xabc' }, ip: '1.2.3.4' } as unknown as Request;
        expect(captured.keyGenerator!(req)).toBe('0xabc');
    });

    it('falls back to ip-based key when req.user is absent', () => {
        const req = { ip: '1.2.3.4' } as unknown as Request;
        expect(captured.keyGenerator!(req)).toBe('ip:1.2.3.4');
    });

    it('falls back to ip-based key when req.ip is undefined', () => {
        const req = {} as unknown as Request;
        expect(captured.keyGenerator!(req)).toBe('ip:');
    });
});
