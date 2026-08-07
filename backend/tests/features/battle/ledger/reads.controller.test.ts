import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@features/battle/ledger/reads.service', () => ({
    getBattleStateSummary: vi.fn(),
    getSignedCommitment: vi.fn(),
    getSignedReceipt: vi.fn(),
    getCombatLog: vi.fn(),
    listActiveSigningKeys: vi.fn(),
    listRulesets: vi.fn(),
    getRuleset: vi.fn(),
    verifyReceiptSignature: vi.fn(),
}));

import {
    getBattleStateSummary,
    getCombatLog,
    getRuleset,
    getSignedCommitment,
    getSignedReceipt,
    listActiveSigningKeys,
    listRulesets,
    verifyReceiptSignature,
} from '../../../../src/features/battle/ledger/reads.service';
import {
    getBattleCombatLog,
    getBattleCommitment,
    getBattleReceipt,
    getBattleStateHandler,
    getRulesetByHash,
    getRulesets,
    getSigningKeys,
    postVerifyReceipt,
} from '../../../../src/features/battle/ledger/reads.controller';

function mockRes() {
    const res = { status: vi.fn(), json: vi.fn() };
    res.status.mockReturnValue(res);
    return res as unknown as { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('getBattleStateHandler', () => {
    it('returns 404 for an unknown battle', async () => {
        vi.mocked(getBattleStateSummary).mockResolvedValue(null);
        const res = mockRes();
        await getBattleStateHandler({ params: { battleId: 'missing' } } as never, res as never);
        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 200 with the summary, reading battleId from the route param', async () => {
        vi.mocked(getBattleStateSummary).mockResolvedValue({ battleId: 'btl_1' } as never);
        const res = mockRes();
        await getBattleStateHandler({ params: { battleId: 'btl_1' } } as never, res as never);
        expect(getBattleStateSummary).toHaveBeenCalledWith('btl_1');
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ battleId: 'btl_1' });
    });
});

describe('getBattleCommitment', () => {
    it('returns 404 when no commitment exists yet', async () => {
        vi.mocked(getSignedCommitment).mockResolvedValue(null);
        const res = mockRes();
        await getBattleCommitment({ params: { battleId: 'btl_1' } } as never, res as never);
        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns the commitment on success', async () => {
        vi.mocked(getSignedCommitment).mockResolvedValue({ hash: '0xabc' } as never);
        const res = mockRes();
        await getBattleCommitment({ params: { battleId: 'btl_1' } } as never, res as never);
        expect(res.status).toHaveBeenCalledWith(200);
    });
});

describe('getBattleReceipt', () => {
    it('returns 404 before signing completes', async () => {
        vi.mocked(getSignedReceipt).mockResolvedValue(null);
        const res = mockRes();
        await getBattleReceipt({ params: { battleId: 'btl_1' } } as never, res as never);
        expect(res.status).toHaveBeenCalledWith(404);
    });
});

describe('getBattleCombatLog', () => {
    it('returns 404 before the fight has been computed', async () => {
        vi.mocked(getCombatLog).mockResolvedValue(null);
        const res = mockRes();
        await getBattleCombatLog({ params: { battleId: 'btl_1' } } as never, res as never);
        expect(res.status).toHaveBeenCalledWith(404);
    });
});

describe('getSigningKeys', () => {
    it('serves whatever the running process currently publishes, synchronously', () => {
        vi.mocked(listActiveSigningKeys).mockReturnValue([{ keyId: 'a' } as never]);
        const res = mockRes();
        getSigningKeys({} as never, res as never);
        expect(res.json).toHaveBeenCalledWith({ keys: [{ keyId: 'a' }] });
    });
});

describe('getRulesets', () => {
    it('wraps the list under a rulesets key', async () => {
        vi.mocked(listRulesets).mockResolvedValue([{ version: 1 } as never]);
        const res = mockRes();
        await getRulesets({} as never, res as never);
        expect(res.json).toHaveBeenCalledWith({ rulesets: [{ version: 1 }] });
    });
});

describe('getRulesetByHash', () => {
    it('returns 404 for an unpublished hash', async () => {
        vi.mocked(getRuleset).mockResolvedValue(null);
        const res = mockRes();
        await getRulesetByHash({ params: { rulesetHash: '0xdead' } } as never, res as never);
        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('reads the hash from the route param', async () => {
        vi.mocked(getRuleset).mockResolvedValue({ version: 1 } as never);
        const res = mockRes();
        await getRulesetByHash({ params: { rulesetHash: '0xabc' } } as never, res as never);
        expect(getRuleset).toHaveBeenCalledWith('0xabc');
    });
});

describe('postVerifyReceipt', () => {
    it('rejects a request missing receiptHash', async () => {
        const res = mockRes();
        await postVerifyReceipt({ body: {} } as never, res as never);
        expect(res.status).toHaveBeenCalledWith(422);
        expect(verifyReceiptSignature).not.toHaveBeenCalled();
    });

    it('returns 200 when verification passes', async () => {
        vi.mocked(verifyReceiptSignature).mockResolvedValue({ ok: true, receiptHash: '0xabc' });
        const res = mockRes();
        await postVerifyReceipt({ body: { receiptHash: '0xabc' } } as never, res as never);
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns 422, not 200, when verification fails', async () => {
        // A failed check is a client-meaningful outcome, not a server error.
        vi.mocked(verifyReceiptSignature).mockResolvedValue({
            ok: false,
            reason: 'bad-signature',
            detail: 'nope',
        });
        const res = mockRes();
        await postVerifyReceipt({ body: { receiptHash: '0xabc' } } as never, res as never);
        expect(res.status).toHaveBeenCalledWith(422);
    });
});
