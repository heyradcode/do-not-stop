import { Prisma } from '@generated/prisma/client';

import { prisma } from '@config/prisma';
import { servedChainIdForFamily } from './battleProgress.overlay';
import { ownerKey } from './owner.sql';
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
 *
 * Every query below is built from the fragments beneath: the merge, the "has fought"
 * filter and the ordering each exist once. That matters beyond tidiness — `findPlayerRank`
 * must order identically to `findPlayerLeaderboard` or a player's stated rank stops
 * matching where they appear on the board, and nothing but shared text enforces that.
 */

/** One ranked owner: their pets' battle records, summed. */
export interface PlayerLeaderboardEntry {
    /** 1-based position in the full ranking, not within the page. */
    rank: number;
    /** Wallet address / pubkey, as grouped — see `ownerKey`. */
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
    /** Filters the board without renumbering it; see `contains`. */
    search?: string | undefined;
}

/** The projected columns, before the rank is attached. */
type RankedRow = Omit<LeaderboardEntry, 'rank' | 'chain'> & { chain: string };
type PlayerRow = Omit<PlayerLeaderboardEntry, 'rank'>;

/**
 * The join onto backend progression.
 *
 * A null `chainId` — this deployment serves no chain of the family — is not a special
 * case needing its own query. `p.chain_id = NULL` is never true, so the LEFT JOIN matches
 * nothing, every `COALESCE` below falls through to the roster column, and the result is
 * exactly the chain-state-only ranking. Verified against live data on both chains.
 */
const progressJoin = (chainId: string | null): Prisma.Sql => Prisma.sql`
    LEFT JOIN pet_battle_progress p
        ON p.pet_id = r.pet_id
       AND p.chain_id = ${chainId}
       AND p.deployment_id = ${servedDeploymentId()}
`;

// COALESCE for win/loss, GREATEST for level, matching `overlayRosterPet` and
// `findReadyOpponents`: a progress row supplies the battle record wholesale (nothing on
// chain writes it any more), while level keeps two live writers — backend battles raise
// the row, paid on-chain train()/levelUp() raise the roster.
const WINS = Prisma.sql`COALESCE(p.win_count, r.win_count)`;
const LOSSES = Prisma.sql`COALESCE(p.loss_count, r.loss_count)`;
const LEVEL = Prisma.sql`GREATEST(r.level, COALESCE(p.level, 0))`;

/**
 * Pets and owners with no record at all are excluded. A board of never-fought pets would
 * be a roster dump with a rank column, and on this ordering they would all tie last.
 */
const HAS_FOUGHT = Prisma.sql`${WINS} + ${LOSSES} > 0`;

/**
 * Wins descending, then losses ascending, then a stable tiebreak.
 *
 * The losses key *is* the win-rate tiebreak: among rows on equal wins, fewer losses is a
 * strictly higher rate, so no division is needed and nothing is ranked on a ratio drawn
 * from a handful of fights.
 */
const petOrder = Prisma.sql`${WINS} DESC, ${LOSSES} ASC, ${LEVEL} DESC, r.pet_id ASC`;

/**
 * A search term as a case-insensitive contains-match against any of several columns.
 *
 * Several, because one box has to answer both questions people bring here — "how is my
 * pet doing" and "how is that player doing" — and nobody should have to know which board
 * indexes which. A wallet address typed into the pet board finds that wallet's pets.
 *
 * `TRUE` for a blank term rather than a second query: an unfiltered board is the same
 * shape as a filtered one, and branching would double every query below.
 *
 * `%` and `_` are escaped because they are wildcards to `ILIKE` — a player searching for
 * a pet actually named `100%` should not match every pet on the board.
 */
function matchesAny(columns: Prisma.Sql[], term: string | undefined): Prisma.Sql {
    const needle = term?.trim();
    if (!needle) return Prisma.sql`TRUE`;
    const escaped = needle.replace(/[\\%_]/g, (char) => `\\${char}`);
    const pattern = `%${escaped}%`;
    return Prisma.sql`(${Prisma.join(
        columns.map((column) => Prisma.sql`${column} ILIKE ${pattern} ESCAPE '\\'`),
        ' OR '
    )})`;
}

const playerOrder = (owner: Prisma.Sql) =>
    Prisma.sql`SUM(${WINS}) DESC, SUM(${LOSSES}) ASC, ${owner} ASC`;

/** A page of the pet leaderboard. */
export async function findPetLeaderboard(
    params: FindLeaderboardParams
): Promise<{ entries: LeaderboardEntry[]; total: number }> {
    const join = progressJoin(servedChainIdForFamily(params.chain));
    const skip = params.page * params.pageSize;
    // Name or owner: the pet board is where someone pastes an address to see a rival's
    // pets, and where they type a name to find their own.
    const match = matchesAny(
        [Prisma.sql`ranked.name`, Prisma.sql`ranked.owner`],
        params.search
    );

    /**
     * Ranked first, filtered second.
     *
     * The rank is a position on the whole board, so it has to be assigned before any
     * search narrows the rows — otherwise a pet's rank would change depending on what
     * someone typed, and "where does Yasu sit" is the question a search here is asked.
     * That is why it comes from `ROW_NUMBER` rather than from the offset, which only ever
     * described an unfiltered page.
     */
    const ranked = Prisma.sql`
        SELECT r.chain, r.pet_id AS "petId", r.owner, r.name, r.rarity, r.dna, r.asset,
               ${LEVEL} AS level, ${WINS} AS "winCount", ${LOSSES} AS "lossCount",
               ROW_NUMBER() OVER (ORDER BY ${petOrder})::int AS rank
        FROM pet_roster r
        ${join}
        WHERE r.chain = ${params.chain} AND ${HAS_FOUGHT}
    `;

    const [rows, counted] = await Promise.all([
        prisma.$queryRaw<(RankedRow & { rank: number })[]>`
            SELECT * FROM (${ranked}) ranked
            WHERE ${match}
            ORDER BY rank
            LIMIT ${params.pageSize} OFFSET ${skip}
        `,
        // Counted after the filter, since it drives the pager over the matches rather
        // than over the board.
        prisma.$queryRaw<{ total: bigint }[]>`
            SELECT COUNT(*) AS total FROM (${ranked}) ranked WHERE ${match}
        `,
    ]);

    return {
        entries: rows.map((row) => ({ ...row, chain: row.chain as Chain })),
        total: Number(counted[0]?.total ?? 0),
    };
}

/**
 * A page of the player leaderboard: owners ranked by their pets' combined record.
 *
 * Only pets that have fought are summed, so `petCount` reads as "pets with a record"
 * rather than "pets owned", and an owner with no battled pets does not appear at all.
 */
export async function findPlayerLeaderboard(
    params: FindLeaderboardParams
): Promise<{ entries: PlayerLeaderboardEntry[]; total: number }> {
    const join = progressJoin(servedChainIdForFamily(params.chain));
    const owner = ownerKey(params.chain, 'r');
    const skip = params.page * params.pageSize;
    // Address or any of the owner's pet names, so looking up the player behind a pet
    // works without knowing whose it is. The names are aggregated in the subquery below
    // because the filter runs outside it, after the grouping.
    const match = matchesAny(
        [Prisma.sql`ranked.owner`, Prisma.sql`ranked."petNames"`],
        params.search
    );

    // The SUMs are cast because Postgres widens them to bigint, which Prisma would hand
    // back as a BigInt the GraphQL Int serializer cannot take. A player's battle count has
    // no way to approach the int range.
    //
    // Ranked before filtered, for the same reason as the pet board: a rank describes a
    // position on the whole board, not within someone's search.
    const ranked = Prisma.sql`
        SELECT ${owner} AS owner,
               SUM(${WINS})::int AS "winCount",
               SUM(${LOSSES})::int AS "lossCount",
               COUNT(*)::int AS "petCount",
               STRING_AGG(r.name, ' ') AS "petNames",
               ROW_NUMBER() OVER (ORDER BY ${playerOrder(owner)})::int AS rank
        FROM pet_roster r
        ${join}
        WHERE r.chain = ${params.chain} AND ${HAS_FOUGHT}
        GROUP BY ${owner}
    `;

    const [rows, counted] = await Promise.all([
        prisma.$queryRaw<(PlayerRow & { rank: number; petNames: string })[]>`
            SELECT * FROM (${ranked}) ranked
            WHERE ${match}
            ORDER BY rank
            LIMIT ${params.pageSize} OFFSET ${skip}
        `,
        // Counts grouped owners, not joined pet rows: COUNT(*) over the ungrouped join
        // would count pets and page the client past the last owner.
        prisma.$queryRaw<{ total: bigint }[]>`
            SELECT COUNT(*) AS total FROM (${ranked}) ranked WHERE ${match}
        `,
    ]);

    return {
        // `petNames` exists to be searched, not shown: dropped here so it never reaches a
        // client that would have to know to ignore it.
        entries: rows.map(({ petNames: _petNames, ...entry }) => entry),
        total: Number(counted[0]?.total ?? 0),
    };
}

/**
 * One owner's own standing, or null when they hold no pet that has fought.
 *
 * Exists so a player can be told their rank without the client paging the board looking
 * for itself, which costs one request per page and gets worse as the game grows.
 *
 * `ROW_NUMBER` over `playerOrder` — the same ordering the paged query uses, from the same
 * fragment — so this number is the one that row carries on its page. The page arithmetic
 * (`skip + index + 1`) is the same function, and ties cannot diverge because the owner key
 * makes the ordering strict.
 *
 * `owner` must already be normalized the way the JWT normalizes it, which is how
 * `ownerKey` groups. An unnormalized EVM address matches nothing and reads as "unranked",
 * which is why callers pass the authenticated address rather than anything user-supplied.
 */
export async function findPlayerRank(
    chain: Chain,
    owner: string
): Promise<PlayerLeaderboardEntry | null> {
    if (!owner) {
        return null;
    }

    const join = progressJoin(servedChainIdForFamily(chain));
    const key = ownerKey(chain, 'r');

    const rows = await prisma.$queryRaw<PlayerLeaderboardEntry[]>`
        SELECT owner, "winCount", "lossCount", "petCount", rank FROM (
            SELECT ${key} AS owner,
                   SUM(${WINS})::int AS "winCount",
                   SUM(${LOSSES})::int AS "lossCount",
                   COUNT(*)::int AS "petCount",
                   ROW_NUMBER() OVER (ORDER BY ${playerOrder(key)})::int AS rank
            FROM pet_roster r
            ${join}
            WHERE r.chain = ${chain} AND ${HAS_FOUGHT}
            GROUP BY ${key}
        ) ranked
        WHERE owner = ${owner}
    `;

    return rows[0] ?? null;
}
