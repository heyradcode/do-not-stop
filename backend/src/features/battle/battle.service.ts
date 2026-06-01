import { findReadyOpponents } from '../../repositories/roster.repository';
import type { OpponentDto, OpponentsQuery } from './battle.types';

export async function findOpponents(
    query: OpponentsQuery
): Promise<{ opponents: OpponentDto[]; total: number }> {
    const { rows, total } = await findReadyOpponents({
        chain: query.chain,
        excludeOwner: query.caller,
        minLevel: query.minLevel,
        page: query.page,
        pageSize: query.pageSize,
    });

    const opponents: OpponentDto[] = rows.map((row) => ({
        id: row.petId,
        chain: row.chain,
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
