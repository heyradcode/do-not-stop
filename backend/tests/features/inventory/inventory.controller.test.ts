import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../../src/features/inventory/inventory.write', () => ({
    useItem: vi.fn(),
    claimEntitlement: vi.fn(),
    grantItem: vi.fn(),
}));

import { postClaim, postGrant, postUseItem } from '../../../src/features/inventory/inventory.controller';
import { claimEntitlement, grantItem, useItem } from '../../../src/features/inventory/inventory.write';

/**
 * The HTTP layer for the inventory writes (roadmap §4).
 *
 * Its whole job is mapping named failures onto status codes, and two of those mappings are
 * decisions rather than conventions: another wallet's entitlement is 404 so an id cannot be
 * probed, and an unconfigured deployment is 503 rather than a 500 that reads as a bug. A
 * test at the write layer cannot catch either being changed here.
 */

const CALLER = '0xaaa0000000000000000000000000000000000001';

function makeRes() {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    return res as unknown as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

/** A request carrying an authenticated session, as `verifyToken` leaves it. */
function makeReq(body: unknown = {}, params: Record<string, string> = {}) {
    return { body, params, user: { address: CALLER } } as unknown as Request;
}

const USE_BODY = { chain: 'evm', petId: '7', itemType: '100' };

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('authentication', () => {
    /** A request with no session, as an unauthenticated caller would arrive. */
    const anonymous = () => ({ body: USE_BODY, params: { id: 'e1' } }) as Request;

    // Every route sits behind verifyToken, but each handler still refuses a session-less
    // request rather than acting as nobody. Belt and braces: the acting wallet is what
    // decides whose bag is spent and whose entitlement is claimed.
    it.each([
        ['use', postUseItem],
        ['claim', postClaim],
        ['grant', postGrant],
    ] as const)('rejects an unauthenticated %s with 401', async (_route, handler) => {
        const res = makeRes();

        await handler(anonymous(), res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(useItem).not.toHaveBeenCalled();
        expect(claimEntitlement).not.toHaveBeenCalled();
        expect(grantItem).not.toHaveBeenCalled();
    });
});

describe('POST /use', () => {
    it('returns what the write layer produced', async () => {
        const result = { burnTxHash: '0xburn', level: 5, xp: 0, readyAt: 0, leveledUp: true };
        vi.mocked(useItem).mockResolvedValue(result);
        const res = makeRes();

        await postUseItem(makeReq(USE_BODY), res);

        expect(useItem).toHaveBeenCalledWith('evm', CALLER, '7', '100');
        expect(res.json).toHaveBeenCalledWith(result);
    });

    it('rejects a malformed body before calling anything', async () => {
        const res = makeRes();

        await postUseItem(makeReq({ chain: 'evm', petId: 'not-a-number', itemType: '100' }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(useItem).not.toHaveBeenCalled();
    });

    // 503, not 500: the deployment is missing a key, which is a configuration answer rather
    // than a fault, and a player retrying will keep getting it until an operator acts.
    it('reports an unconfigured deployment as 503', async () => {
        vi.mocked(useItem).mockResolvedValue('writes-disabled');
        const res = makeRes();

        await postUseItem(makeReq(USE_BODY), res);

        expect(res.status).toHaveBeenCalledWith(503);
    });

    it.each([
        ['unknown-item', 404],
        ['not-consumable', 400],
        ['not-held', 400],
        ['not-pet-owner', 403],
        ['unknown-pet', 404],
        ['unsupported-chain', 400],
    ] as const)('maps %s to %i', async (failure, status) => {
        vi.mocked(useItem).mockResolvedValue(failure);
        const res = makeRes();

        await postUseItem(makeReq(USE_BODY), res);

        expect(res.status).toHaveBeenCalledWith(status);
    });

    // The burn may already have landed when this throws. The write layer logs that case
    // with what is needed to fix it; the handler's only duty is not to claim success.
    it('does not report success when the write throws', async () => {
        vi.mocked(useItem).mockRejectedValue(new Error('db down'));
        const res = makeRes();

        await postUseItem(makeReq(USE_BODY), res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).not.toHaveBeenCalledWith(expect.objectContaining({ burnTxHash: expect.anything() }));
    });
});

describe('POST /entitlements/:id/claim', () => {
    it('claims the entitlement named in the path', async () => {
        vi.mocked(claimEntitlement).mockResolvedValue({ mintTxHash: '0xmint', itemType: '100', quantity: 2 });
        const res = makeRes();

        await postClaim(makeReq({}, { id: 'e1' }), res);

        expect(claimEntitlement).toHaveBeenCalledWith(CALLER, 'e1');
        expect(res.json).toHaveBeenCalledWith({ mintTxHash: '0xmint', itemType: '100', quantity: 2 });
    });

    // The decision this test exists for. Someone else's entitlement is indistinguishable
    // from one that does not exist, so an id cannot be probed by watching the status
    // change. A 403 here would leak exactly what the write layer refuses to.
    it('reports another wallet’s entitlement as 404, never 403', async () => {
        vi.mocked(claimEntitlement).mockResolvedValue('unknown-entitlement');
        const res = makeRes();

        await postClaim(makeReq({}, { id: 'e1' }), res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.status).not.toHaveBeenCalledWith(403);
    });

    it('reports an already-claimed entitlement as 409', async () => {
        vi.mocked(claimEntitlement).mockResolvedValue('already-claimed');
        const res = makeRes();

        await postClaim(makeReq({}, { id: 'e1' }), res);

        expect(res.status).toHaveBeenCalledWith(409);
    });

    it('rejects an empty id without calling the write layer', async () => {
        const res = makeRes();

        await postClaim(makeReq({}, {}), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(claimEntitlement).not.toHaveBeenCalled();
    });
});

describe('POST /admin/grant', () => {
    const BODY = { chain: 'evm', owner: '0xbbb', itemType: '100', quantity: 3 };

    it('creates the entitlement and answers 201', async () => {
        vi.mocked(grantItem).mockResolvedValue({ entitlementId: 'e9', owner: '0xbbb', itemType: '100', quantity: 3 });
        const res = makeRes();

        await postGrant(makeReq(BODY), res);

        expect(grantItem).toHaveBeenCalledWith(CALLER, 'evm', '0xbbb', '100', 3);
        expect(res.status).toHaveBeenCalledWith(201);
    });

    // The allowlist is empty by default, so this is the answer an ordinary player gets.
    it('reports a caller not on the allowlist as 403', async () => {
        vi.mocked(grantItem).mockResolvedValue('not-admin');
        const res = makeRes();

        await postGrant(makeReq(BODY), res);

        expect(res.status).toHaveBeenCalledWith(403);
    });

    it('defaults the quantity to one when the body omits it', async () => {
        vi.mocked(grantItem).mockResolvedValue({ entitlementId: 'e9', owner: '0xbbb', itemType: '100', quantity: 1 });

        await postGrant(makeReq({ chain: 'evm', owner: '0xbbb', itemType: '100' }), makeRes());

        expect(grantItem).toHaveBeenCalledWith(CALLER, 'evm', '0xbbb', '100', 1);
    });

    // A sanity bound, so one call cannot mint an absurd stack even from an admin wallet.
    it('rejects a quantity past the cap', async () => {
        const res = makeRes();

        await postGrant(makeReq({ ...BODY, quantity: 100_000 }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(grantItem).not.toHaveBeenCalled();
    });
});
