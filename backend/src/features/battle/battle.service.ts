import { prisma } from '../../config/prisma';
import type { OpponentDto, OpponentsQuery } from './battle.types';

export async function findOpponents(
    query: OpponentsQuery
): Promise<{ opponents: OpponentDto[]; total: number }> {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const where = {
        chain: query.chain,
        owner: { not: query.caller },
        readyAt: { lte: BigInt(nowSeconds) },
        ...(query.minLevel > 0 ? { level: { gte: query.minLevel } } : {}),
    };

    const [rows, total] = await prisma.$transaction([
        prisma.petRoster.findMany({
            where,
            orderBy: [{ level: 'asc' }, { petId: 'asc' }],
            skip: query.page * query.pageSize,
            take: query.pageSize,
        }),
        prisma.petRoster.count({ where }),
    ]);

    const opponents: OpponentDto[] = rows.map((row) => ({
        id: row.petId,
        chain: row.chain as OpponentsQuery['chain'],
        owner: row.owner,
        name: row.name,
        dna: row.dna,
        level: row.level,
        rarity: row.rarity,
        winCount: row.winCount,
        lossCount: row.lossCount,
        readyAt: Number(row.readyAt),
    }));

    return { opponents, total };
}
