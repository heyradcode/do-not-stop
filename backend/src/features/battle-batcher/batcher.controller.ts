import type { Request, Response } from 'express';

import { getInclusionProof } from './batcher.service';

/**
 * The receipt-to-root inclusion proof §I requires be published.
 *
 * Unauthenticated, like every other read on this path. A proof is only useful to someone
 * checking our work, and requiring a login to obtain one would make the anchoring claim
 * checkable only by people we chose to let check it.
 *
 * 404 distinguishes two genuinely different answers: no such receipt at all, versus a
 * receipt that exists but is not yet in a batch. The second is a normal, temporary state —
 * a receipt batched a minute from now is simply waiting — while an *unbatched* receipt past
 * the inclusion SLO is operator failure. A client that could not tell them apart could not
 * raise that alarm.
 */
export async function getReceiptInclusionProof(req: Request, res: Response): Promise<void> {
    const proof = await getInclusionProof(req.params.receiptHash as string);
    if (!proof) {
        res.status(404).json({
            error: 'not-batched',
            detail: 'no inclusion proof: this receipt is unknown, or has not been anchored in a batch yet',
        });
        return;
    }
    res.status(200).json(proof);
}
