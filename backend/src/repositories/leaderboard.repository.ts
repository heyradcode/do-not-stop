import { prisma } from '@config/prisma';
import { servedChainIdForFamily } from './battleProgress.overlay';
import { servedDeploymentId } from '@features/battle-ledger/domain';
import type { Chain } from '@typings/chain';

/**
 * Read layer for the pet leaderboard.
 *
 * Ranks on the *merged* battle record, not on `pet_roster` alone. Since battles stopped
 * settling on chain (§L Phase 6) the roster's `win_count`/`loss_count` are frozen at
 * whatever the retired path left behind, while the live record accumulates in
 * `pet_battle_progress` — so ranking on the roster would rank pets by a number that
 * stopped moving, and ranking on progress alone would drop every pet whose whole record
 * predates the backend path.
 *
 * Like `findReadyOpponents`, the merge happens in the query rather than afterwards: the
 * ordering *is* the merge here, and a post-sort can only reorder rows a page already
 * holds. Same consequence, too — no gRPC fast path, because indexer-go's cache holds
 * chain state and has no view of `pet_battle_progress`.
 */

/** One ranked pet. Carries what a leaderboard row displays, not the full roster shape. */
export interface LeaderboardEntry {
    /** 1-based position in the full ranking, not within the page. */
    rank: number;
    chain: Chain;
    petId: string;
    owner: string;
    name: string;
    level: number;
    rarity: number;
    dna: string;
    winCount: number;
    lossCount: number;
    /** Metaplex Core asset pubkey (Solana only); "" on EVM. Needed to address pet art. */
    asset: string;
}

export interface FindLeaderboardParams {
    chain: Chain;
    page: number;
    pageSize: number;
}

/** The projected columns, before the rank is attached. */
interface RankedRow {
    chain: string;
    petId: string;
    owner: string;
    name: string;
    level: number;
    rarity: number;
    dna: string;
    winCount: number;
    lossCount: number;
    asset: string;
}

/**
 * A page of the pet leaderboard, ordered by wins and its win-rate tiebreak.
 *
 * Ordering is wins DESC, then losses ASC, then level DESC, then pet id ASC. The losses
 * tiebreak *is* the win-rate tiebreak: among pets on equal wins, fewer losses is a
 * strictly higher win rate, so no division is needed and pets are never ranked on a
 * ratio computed from a handful of fights.
 *
 * Pets that have never fought are excluded. A leaderboard of pets with no record would
 * be a roster dump with a rank column, and on the current ordering they would all tie
 * at the bottom anyway.
 */
export async function findPetLeaderboard(
    params: FindLeaderboardParams
): Promise<{ entries: LeaderboardEntry[]; total: number }> {
    const chainId = servedChainIdForFamily(params.chain);
    const { rows, total } = chainId
        ? await queryMerged(params, chainId)
        : await queryChainStateOnly(params);

    const offset = params.page * params.pageSize;
    return {
        entries: rows.map((row, index) => ({ ...row, chain: row.chain as Chain, rank: offset + index + 1 })),
        total,
    };
}

/** The join against `pet_battle_progress`, for a chain family this deployment serves. */
async function queryMerged(
    params: FindLeaderboardParams,
    chainId: string
): Promise<{ rows: RankedRow[]; total: number }> {
    const deploymentId = servedDeploymentId();
    const skip = params.page * params.pageSize;

    // COALESCE for win/loss, GREATEST for level, matching `overlayRosterPet` and
    // `findReadyOpponents`: a progress row supplies the battle record wholesale (nothing
    // on chain writes it any more), while level keeps two live writers — backend battles
    // raise the row, paid on-chain train()/levelUp() raise the roster.
    const [rows, counted] = await Promise.all([
        prisma.$queryRaw<RankedRow[]>`
            SELECT r.chain, r.pet_id AS "petId", r.owner, r.name, r.rarity, r.dna, r.asset,
                   GREATEST(r.level, COALESCE(p.level, 0)) AS level,
                   COALESCE(p.win_count, r.win_count) AS "winCount",
                   COALESCE(p.loss_count, r.loss_count) AS "lossCount"
            FROM pet_roster r
            LEFT JOIN pet_battle_progress p
                ON p.pet_id = r.pet_id
               AND p.chain_id = ${chainId}
               AND p.deployment_id = ${deploymentId}
            WHERE r.chain = ${params.chain}
              AND COALESCE(p.win_count, r.win_count) + COALESCE(p.loss_count, r.loss_count) > 0
            ORDER BY COALESCE(p.win_count, r.win_count) DESC,
                     COALESCE(p.loss_count, r.loss_count) ASC,
                     GREATEST(r.level, COALESCE(p.level, 0)) DESC,
                     r.pet_id ASC
            LIMIT ${params.pageSize} OFFSET ${skip}
        `,
        prisma.$queryRaw<{ total: bigint }[]>`
            SELECT COUNT(*) AS total
            FROM pet_roster r
            LEFT JOIN pet_battle_progress p
                ON p.pet_id = r.pet_id
               AND p.chain_id = ${chainId}
               AND p.deployment_id = ${deploymentId}
            WHERE r.chain = ${params.chain}
              AND COALESCE(p.win_count, r.win_count) + COALESCE(p.loss_count, r.loss_count) > 0
        `,
    ]);

    return { rows, total: Number(counted[0]?.total ?? 0) };
}

/** The same ranking without progression, for a chain family this deployment does not serve. */
async function queryChainStateOnly(
    params: FindLeaderboardParams
): Promise<{ rows: RankedRow[]; total: number }> {
    const where = {
        chain: params.chain,
        OR: [{ winCount: { gt: 0 } }, { lossCount: { gt: 0 } }],
    };

    const [rows, total] = await Promise.all([
        prisma.petRoster.findMany({
            where,
            select: {
                chain: true,
                petId: true,
                owner: true,
                name: true,
                level: true,
                rarity: true,
                dna: true,
                winCount: true,
                lossCount: true,
                asset: true,
            },
            orderBy: [
                { winCount: 'desc' },
                { lossCount: 'asc' },
                { level: 'desc' },
                { petId: 'asc' },
            ],
            skip: params.page * params.pageSize,
            take: params.pageSize,
        }),
        prisma.petRoster.count({ where }),
    ]);

    return { rows, total };
}
