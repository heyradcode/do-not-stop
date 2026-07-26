import { assertBattleReceipt, type BattleReceipt, receiptFromWire } from '@cryptopets/protocol';

import { checkChainContinuity, checkOperatorSignature, type CheckResult } from './checks';
import type { SignedReceiptEnvelope, TrustedSigningKey } from './io';

export interface VerifyReceiptsReport {
    results: CheckResult[];
    ok: boolean;
}

/**
 * Runs every check this step covers over a set of signed receipt envelopes: the operator
 * signature per receipt, then hash-chain continuity across the whole run (§H item 1). Both
 * need nothing beyond the receipts themselves and a trusted key list — no drand round, no
 * combat replay, no backend access.
 *
 * A receipt that fails to parse, or fails its own internal consistency check
 * (`assertBattleReceipt` — malformed hashes, a seed that does not follow from its own
 * inputs, and so on), is reported as a `malformed-receipt` failure and excluded from the
 * chain-continuity walk, since that walk assumes every receipt in the run is at least
 * well-formed to begin with.
 */
export function verifyReceipts(
    envelopes: readonly SignedReceiptEnvelope[],
    trustedKeys: readonly TrustedSigningKey[],
): VerifyReceiptsReport {
    const results: CheckResult[] = [];
    const receipts: BattleReceipt[] = [];

    for (const envelope of envelopes) {
        let receipt: BattleReceipt;
        try {
            receipt = assertBattleReceipt(receiptFromWire(envelope.payload));
        } catch (error) {
            results.push({
                check: 'malformed-receipt',
                ok: false,
                detail: `${envelope.receiptHash}: ${(error as Error).message}`,
            });
            continue;
        }
        receipts.push(receipt);
        results.push(checkOperatorSignature(envelope, receipt, trustedKeys));
    }

    if (receipts.length > 0) {
        results.push(checkChainContinuity(receipts));
    }

    return { results, ok: results.every((result) => result.ok) };
}
