import { hashBattleReceipt } from '@cryptopets/protocol';
import { describe, expect, it } from 'vitest';

import { verifyReceipts } from '../src/verify';
import { buildSignedReceipt } from './fixtures/signedReceipt';

describe('verifyReceipts', () => {
    it('passes a single well-formed, correctly-signed receipt', () => {
        const { envelope, trustedKey } = buildSignedReceipt();
        const report = verifyReceipts([envelope], [trustedKey]);
        expect(report.ok).toBe(true);
        expect(report.results.map((r) => r.check)).toEqual(['operator-signature', 'chain-continuity']);
    });

    it('reports both an operator-signature failure and continuity for an unbroken but untrusted run', () => {
        const first = buildSignedReceipt({ battleId: 'btl_0001' });
        const second = buildSignedReceipt({
            battleId: 'btl_0002',
            sequence: 2,
            previousReceiptHash: hashBattleReceipt(first.receipt),
            createdAt: first.receipt.createdAt + 1,
        });
        // No trusted keys supplied: both signatures fail closed, but the chain itself is intact.
        const report = verifyReceipts([first.envelope, second.envelope], []);
        expect(report.ok).toBe(false);
        const signatureFailures = report.results.filter((r) => r.check === 'operator-signature');
        expect(signatureFailures).toHaveLength(2);
        expect(signatureFailures.every((r) => !r.ok)).toBe(true);
        expect(report.results.find((r) => r.check === 'chain-continuity')).toEqual({
            check: 'chain-continuity',
            ok: true,
        });
    });

    it('reports a malformed-receipt failure and excludes it from the chain walk, without throwing', () => {
        const { envelope, trustedKey } = buildSignedReceipt();
        // A seed that does not follow from the receipt's own inputs: `assertBattleReceipt`
        // rejects this (`receipt.test.ts` pins the same check in `protocol`), so this
        // receipt never becomes a typed `BattleReceipt` at all.
        const malformed = {
            ...envelope,
            payload: { ...(envelope.payload as Record<string, unknown>), seed: `0x${'99'.repeat(32)}` } as never,
        };

        const report = verifyReceipts([malformed], [trustedKey]);
        expect(report.ok).toBe(false);
        expect(report.results).toEqual([
            {
                check: 'malformed-receipt',
                ok: false,
                detail: expect.stringContaining(malformed.receiptHash),
            },
        ]);
    });

    it('passes an empty input with no results at all', () => {
        expect(verifyReceipts([], [])).toEqual({ results: [], ok: true });
    });
});
