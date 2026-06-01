import express, { Request, Response, Router } from 'express';
import { prisma } from '../lib/prisma';
import { verifyToken, AuthenticatedRequest } from '../middleware/auth';

const router: Router = express.Router();

// All battle endpoints require an authenticated wallet.
router.use(verifyToken);

const SUPPORTED_CHAINS = ['evm', 'solana'] as const;
type SupportedChain = (typeof SUPPORTED_CHAINS)[number];

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

interface OpponentDto {
    id: string;
    chain: SupportedChain;
    owner: string;
    name: string;
    dna: string; // bigint serialized as string for JSON
    level: number;
    rarity: number;
    winCount: number;
    lossCount: number;
    readyAt: number; // unix seconds
}

interface OpponentsResponse {
    opponents: OpponentDto[];
    total: number;
    page: number;
    pageSize: number;
}

function parseIntParam(value: unknown, fallback: number, min: number, max: number): number {
    const n = Number.parseInt(String(value ?? ''), 10);
    if (Number.isNaN(n)) return fallback;
    return Math.min(Math.max(n, min), max);
}

/**
 * GET /api/battle/opponents
 *
 * Lists battle-ready pets the caller does NOT own, for matchmaking.
 * The roster is populated off-chain by the indexer (see PVP_BATTLE.md §2);
 * until that exists, run `pnpm --filter backend seed:roster` to add demo rows.
 *
 * Query params:
 *   chain    (required) 'evm' | 'solana'
 *   minLevel (optional) only pets at or above this level
 *   page     (optional) zero-based page index
 *   pageSize (optional) 1..50, default 20
 */
router.get('/opponents', async (req: Request, res: Response<OpponentsResponse | { error: string }>) => {
    const authReq = req as AuthenticatedRequest;
    const caller = authReq.user?.address ?? '';

    const chain = String(req.query.chain ?? '');
    if (!SUPPORTED_CHAINS.includes(chain as SupportedChain)) {
        res.status(400).json({ error: `chain must be one of: ${SUPPORTED_CHAINS.join(', ')}` });
        return;
    }

    const minLevel = parseIntParam(req.query.minLevel, 0, 0, 1_000_000);
    const page = parseIntParam(req.query.page, 0, 0, 1_000_000);
    const pageSize = parseIntParam(req.query.pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    const nowSeconds = Math.floor(Date.now() / 1000);

    // Exclude the caller's own pets, only show pets that are off cooldown.
    const where = {
        chain,
        owner: { not: caller },
        readyAt: { lte: BigInt(nowSeconds) },
        ...(minLevel > 0 ? { level: { gte: minLevel } } : {}),
    };

    try {
        const [rows, total] = await prisma.$transaction([
            prisma.petRoster.findMany({
                where,
                orderBy: [{ level: 'asc' }, { petId: 'asc' }],
                skip: page * pageSize,
                take: pageSize,
            }),
            prisma.petRoster.count({ where }),
        ]);

        const opponents: OpponentDto[] = rows.map((row) => ({
            id: row.petId,
            chain: row.chain as SupportedChain,
            owner: row.owner,
            name: row.name,
            dna: row.dna,
            level: row.level,
            rarity: row.rarity,
            winCount: row.winCount,
            lossCount: row.lossCount,
            readyAt: Number(row.readyAt),
        }));

        res.json({ opponents, total, page, pageSize });
    } catch {
        res.status(500).json({ error: 'Failed to load opponents' });
    }
});

export default router;
