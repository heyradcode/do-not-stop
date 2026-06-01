import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '@middleware/auth';
import { parseIntParam } from '@utils';
import { SUPPORTED_CHAINS, isSupportedChain } from '@typings/chain';
import { findOpponents } from './battle.service';
import {
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    type BattleErrorResponse,
    type OpponentsResponse,
} from './battle.types';

/**
 * GET /api/battle/opponents
 *
 * Lists battle-ready pets the caller does NOT own, for matchmaking.
 * The roster is populated by the subgraph indexer; use `seed:roster` for demo data.
 */
export async function getOpponents(
    req: Request,
    res: Response<OpponentsResponse | BattleErrorResponse>
): Promise<void> {
    const authReq = req as AuthenticatedRequest;
    const caller = authReq.user?.address ?? '';

    const chain = String(req.query.chain ?? '');
    if (!isSupportedChain(chain)) {
        res.status(400).json({ error: `chain must be one of: ${SUPPORTED_CHAINS.join(', ')}` });
        return;
    }

    const minLevel = parseIntParam(req.query.minLevel, 0, 0, 1_000_000);
    const page = parseIntParam(req.query.page, 0, 0, 1_000_000);
    const pageSize = parseIntParam(req.query.pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);

    try {
        const { opponents, total } = await findOpponents({
            chain,
            caller,
            minLevel,
            page,
            pageSize,
        });

        res.json({ opponents, total, page, pageSize });
    } catch {
        res.status(500).json({ error: 'Failed to load opponents' });
    }
}
