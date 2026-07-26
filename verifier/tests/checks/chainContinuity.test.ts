import { hashBattleReceipt } from '@cryptopets/protocol';
import { describe, expect, it } from 'vitest';

import { checkChainContinuity } from '../../src/checks/chainContinuity';
import { buildReceipt } from '../fixtures/signedReceipt';

describe('checkChainContinuity', () => {
    it('passes an unbroken run', () => {
        const first = buildReceipt({ battleId: 'btl_0001' });
        const second = buildReceipt({
            battleId: 'btl_0002',
            sequence: 2,
            previousReceiptHash: hashBattleReceipt(first),
            createdAt: first.createdAt + 1,
        });
        expect(checkChainContinuity([first, second])).toEqual({ check: 'chain-continuity', ok: true });
    });

    it('fails and names the offending index and battle id on a broken link', () => {
        const first = buildReceipt({ battleId: 'btl_0001' });
        const third = buildReceipt({
            battleId: 'btl_0003',
            sequence: 3,
            previousReceiptHash: `0x${'99'.repeat(32)}`,
            createdAt: first.createdAt + 2,
        });
        const result = checkChainContinuity([first, third]);
        expect(result.ok).toBe(false);
        expect(result.detail).toMatch(/index 1/);
        expect(result.detail).toMatch(/btl_0003/);
        expect(result.detail).toMatch(/broken-link/);
    });

    it('fails on a sequence gap, which is what a withheld receipt looks like', () => {
        const first = buildReceipt({ battleId: 'btl_0001' });
        const skipped = buildReceipt({
            battleId: 'btl_0003',
            sequence: 3,
            previousReceiptHash: hashBattleReceipt(first),
            createdAt: first.createdAt + 1,
        });
        const result = checkChainContinuity([first, skipped]);
        expect(result.ok).toBe(false);
        expect(result.detail).toMatch(/sequence-not-consecutive/);
    });

    it('rejects the wrong anchor when one is asserted, and passes when none is given', () => {
        const first = buildReceipt({ battleId: 'btl_0001' });
        const second = buildReceipt({
            battleId: 'btl_0002',
            sequence: 2,
            previousReceiptHash: hashBattleReceipt(first),
            createdAt: first.createdAt + 1,
        });
        expect(checkChainContinuity([second], `0x${'99'.repeat(32)}`).ok).toBe(false);
        expect(checkChainContinuity([second]).ok).toBe(true);
    });
});
