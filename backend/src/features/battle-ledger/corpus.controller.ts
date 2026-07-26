import type { Request, Response } from 'express';

import { listReceiptsByPet, listReceiptsBySequence, listReceiptsByWallet } from './corpus.service';

/**
 * The public receipt corpus (§H item 3). No `verifyToken` on any of these — see
 * `corpus.service.ts`'s doc comment for why authentication would defeat the point.
 */

interface PaginationQuery {
    cursor?: string;
    limit?: string;
}

export async function getReceiptsByPet(req: Request, res: Response): Promise<void> {
    const { chainId, petId } = req.params as { chainId: string; petId: string };
    const { cursor, limit } = req.query as PaginationQuery;
    const page = await listReceiptsByPet(chainId, petId, cursor, limit ? Number(limit) : undefined);
    res.status(200).json(page);
}

export async function getReceiptsByWallet(req: Request, res: Response): Promise<void> {
    const { wallet } = req.params as { wallet: string };
    const { cursor, limit } = req.query as PaginationQuery;
    const page = await listReceiptsByWallet(wallet, cursor, limit ? Number(limit) : undefined);
    res.status(200).json(page);
}

interface SequenceQuery {
    signingKeyId?: string;
    after?: string;
    limit?: string;
}

export async function getReceiptsBySequence(req: Request, res: Response): Promise<void> {
    const { signingKeyId, after, limit } = req.query as SequenceQuery;
    if (!signingKeyId) {
        res.status(422).json({ error: 'signingKeyId is required' });
        return;
    }
    const page = await listReceiptsBySequence(signingKeyId, after, limit ? Number(limit) : undefined);
    res.status(200).json(page);
}
