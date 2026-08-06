import { Prisma } from '@generated/prisma/client';

import { prisma } from '@config/prisma';
import { servedChainIdForFamily } from './battleProgress.overlay';
import { servedDeploymentId } from '@features/battle-ledger/domain';
import type { Chain } from '@typings/chain';

/**
 * Read layer for the leaderboards: pets ranked individually, and owners ranked by their
 * pets' combined record.
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

/** One ranked owner: their pets' battle records, summed. */
export interface PlayerLeaderboardEntry {
    /** 1-based position in the full ranking, not within the page. */
    rank: number;
    /** Wallet address / pubkey. EVM addresses are folded to lowercase; see `ownerKey`. */
    owner: string;
    winCount: number;
    lossCount: number;
    /** How many of this owner's pets have a battle record. */
    petCount: number;
}

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

/**
 * What one owner is grouped by.
 *
 * EVM addresses are folded, base58 Solana pubkeys are not — the same split
 * `normalizeAccount` makes, and the same one `findReadyOpponents` applies to its consent
 * match. It matters more here than there: indexer-go is not guaranteed to write the
 * roster in one case, and an unfolded EVM group would list a single wallet twice with its
 * record split between the rows. Folding base58 would do the opposite damage, merging two
 * distinct pubkeys into one player.
 */
function ownerKey(chain: Chain): Prisma.Sql {
    return chain === 'evm' ? Prisma.sql`LOWER(r.owner)` : Prisma.sql`r.owner`;
}

/**
 * A page of the player leaderboard: owners ranked by their pets' combined record.
 *
 * Same ordering rule as the pet board — wins DESC, then losses ASC as the win-rate
 * tiebreak — with the owner key as the stable final tiebreak. Only pets that have fought
 * are summed, so `petCount` reads as "pets with a record" rather than "pets owned", and
 * an owner with no battled pets does not appear at all.
 */
export async function findPlayerLeaderboard(
    params: FindLeaderboardParams
): Promise<{ entries: PlayerLeaderboardEntry[]; total: number }> {
    const chainId = servedChainIdForFamily(params.chain);
    const { rows, total } = chainId
        ? await queryPlayersMerged(params, chainId)
        : await queryPlayersFromChainState(params);

    const offset = params.page * params.pageSize;
    return {
        entries: rows.map((row, index) => ({ ...row, rank: offset + index + 1 })),
        total,
    };
}

/** The aggregate before its rank is attached. */
interface PlayerRow {
    owner: string;
    winCount: number;
    lossCount: number;
    petCount: number;
}

/** The owner aggregate over merged records, for a chain family this deployment serves. */
async function queryPlayersMerged(
    params: FindLeaderboardParams,
    chainId: string
): Promise<{ rows: PlayerRow[]; total: number }> {
    const deploymentId = servedDeploymentId();
    const skip = params.page * params.pageSize;
    const owner = ownerKey(params.chain);

    // The SUMs are cast because Postgres widens them to bigint, which Prisma would hand
    // back as a BigInt the GraphQL Int serializer cannot take. A player's battle count
    // has no way to approach the int range.
    const [rows, counted] = await Promise.all([
        prisma.$queryRaw<PlayerRow[]>`
            SELECT ${owner} AS owner,
                   SUM(COALESCE(p.win_count, r.win_count))::int AS "winCount",
                   SUM(COALESCE(p.loss_count, r.loss_count))::int AS "lossCount",
                   COUNT(*)::int AS "petCount"
            FROM pet_roster r
            LEFT JOIN pet_battle_progress p
                ON p.pet_id = r.pet_id
               AND p.chain_id = ${chainId}
               AND p.deployment_id = ${deploymentId}
            WHERE r.chain = ${params.chain}
              AND COALESCE(p.win_count, r.win_count) + COALESCE(p.loss_count, r.loss_count) > 0
            GROUP BY ${owner}
            ORDER BY "winCount" DESC, "lossCount" ASC, ${owner} ASC
            LIMIT ${params.pageSize} OFFSET ${skip}
        `,
        prisma.$queryRaw<{ total: bigint }[]>`
            SELECT COUNT(*) AS total FROM (
                SELECT 1
                FROM pet_roster r
                LEFT JOIN pet_battle_progress p
                    ON p.pet_id = r.pet_id
                   AND p.chain_id = ${chainId}
                   AND p.deployment_id = ${deploymentId}
                WHERE r.chain = ${params.chain}
                  AND COALESCE(p.win_count, r.win_count) + COALESCE(p.loss_count, r.loss_count) > 0
                GROUP BY ${owner}
            ) owners
        `,
    ]);

    return { rows, total: Number(counted[0]?.total ?? 0) };
}

/**
 * One owner's own standing, or null when they hold no pet that has fought.
 *
 * Exists so a player can be told their rank without the client paging the board looking
 * for itself, which costs one request per page and gets worse as the game grows.
 *
 * `ROW_NUMBER` over the same ORDER BY the paged query uses, so the number here is the
 * number that row would carry on its page — the page arithmetic (`offset + index + 1`)
 * is the same function. Ties cannot diverge either, since the owner key makes the
 * ordering strict.
 *
 * `owner` must already be normalized the way the JWT normalizes it (EVM lowercased,
 * Solana base58 as-is), which is exactly how `ownerKey` groups. An unnormalized EVM
 * address matches nothing and reads as "unranked", which is why the caller passes the
 * authenticated address rather than anything user-supplied.
 */
export async function findPlayerRank(
    chain: Chain,
    owner: string
): Promise<PlayerLeaderboardEntry | null> {
    if (!owner) {
        return null;
    }

    const chainId = servedChainIdForFamily(chain);
    const key = ownerKey(chain);

    // The two branches differ only in whether progression is joined, matching the two
    // paged queries above.
    const ranked = chainId
        ? Prisma.sql`
            SELECT ${key} AS owner,
                   SUM(COALESCE(p.win_count, r.win_count))::int AS "winCount",
                   SUM(COALESCE(p.loss_count, r.loss_count))::int AS "lossCount",
                   COUNT(*)::int AS "petCount",
                   ROW_NUMBER() OVER (
                       ORDER BY SUM(COALESCE(p.win_count, r.win_count)) DESC,
                                SUM(COALESCE(p.loss_count, r.loss_count)) ASC,
                                ${key} ASC
                   )::int AS rank
            FROM pet_roster r
            LEFT JOIN pet_battle_progress p
                ON p.pet_id = r.pet_id
               AND p.chain_id = ${chainId}
               AND p.deployment_id = ${servedDeploymentId()}
            WHERE r.chain = ${chain}
              AND COALESCE(p.win_count, r.win_count) + COALESCE(p.loss_count, r.loss_count) > 0
            GROUP BY ${key}
        `
        : Prisma.sql`
            SELECT ${key} AS owner,
                   SUM(r.win_count)::int AS "winCount",
                   SUM(r.loss_count)::int AS "lossCount",
                   COUNT(*)::int AS "petCount",
                   ROW_NUMBER() OVER (
                       ORDER BY SUM(r.win_count) DESC, SUM(r.loss_count) ASC, ${key} ASC
                   )::int AS rank
            FROM pet_roster r
            WHERE r.chain = ${chain} AND r.win_count + r.loss_count > 0
            GROUP BY ${key}
        `;

    const rows = await prisma.$queryRaw<PlayerLeaderboardEntry[]>`
        SELECT owner, "winCount", "lossCount", "petCount", rank
        FROM (${ranked}) ranked
        WHERE owner = ${owner}
    `;

    return rows[0] ?? null;
}

/** The same aggregate without progression, for a chain family this deployment does not serve. */
async function queryPlayersFromChainState(
    params: FindLeaderboardParams
): Promise<{ rows: PlayerRow[]; total: number }> {
    const skip = params.page * params.pageSize;
    const owner = ownerKey(params.chain);

    const [rows, counted] = await Promise.all([
        prisma.$queryRaw<PlayerRow[]>`
            SELECT ${owner} AS owner,
                   SUM(r.win_count)::int AS "winCount",
                   SUM(r.loss_count)::int AS "lossCount",
                   COUNT(*)::int AS "petCount"
            FROM pet_roster r
            WHERE r.chain = ${params.chain}
              AND r.win_count + r.loss_count > 0
            GROUP BY ${owner}
            ORDER BY "winCount" DESC, "lossCount" ASC, ${owner} ASC
            LIMIT ${params.pageSize} OFFSET ${skip}
        `,
        prisma.$queryRaw<{ total: bigint }[]>`
            SELECT COUNT(DISTINCT ${owner}) AS total
            FROM pet_roster r
            WHERE r.chain = ${params.chain}
              AND r.win_count + r.loss_count > 0
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
