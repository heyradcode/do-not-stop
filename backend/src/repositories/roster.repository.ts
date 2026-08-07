import { hashRuleset, SOURCE_DEFAULT_RULESET } from '@cryptopets/protocol';
import { Prisma } from '@generated/prisma/client';

import { prisma } from '@config/prisma';
import { tryGrpcGetPetState } from '@grpc-client/rosterReads';
import { mapRosterRowToRosterPet, type PetRosterRow } from './roster.mapping';
import { servedChainIdForFamily } from './battleProgress.overlay';
import { ownerKey } from './owner.sql';
import { servedDeploymentId } from '@features/battle/ledger/domain';
import type { Chain } from '@typings/chain';

/**
 * Read access layer for the `pet_roster` table. indexer-go is the sole writer now (it owns
 * event decoding + the write-through cache), so the backend only reads here.
 *
 * Everything but `findReadyOpponents` returns chain state unchanged — callers that display
 * pets merge backend progression on top (`battleProgress.overlay.ts`), and two callers
 * (`snapshot.builder.ts`, `intent.service.ts`) specifically need the unmerged values.
 * `findReadyOpponents` is the exception, for the reason given on it.
 */

/** A roster row (the shape indexer-go writes; the read paths project to it). */
export interface RosterPet {
    chain: Chain;
    petId: string;
    owner: string;
    name: string;
    level: number;
    rarity: number;
    dna: string;
    winCount: number;
    lossCount: number;
    readyAt: bigint;

    // v2 fields (indexer-go writes these; contracts plan §3.4, §4.1, §3.7, §4.4, §2.3).
    xp: number;
    generation: number;
    parent1Id: string; // "0" = none
    parent2Id: string;
    breedCount: number;
    speciesId: number;
    spouseId: string; // "0" = unmarried
    breedReadyAt: bigint;
    trainReadyAt: bigint;
    asset: string; // Metaplex Core asset pubkey (Solana only); "" on EVM
}

export interface FindOpponentsParams {
    chain: Chain;
    /** Caller's address/pubkey — excluded from results. */
    excludeOwner: string;
    minLevel: number;
    page: number;
    pageSize: number;
}

/**
 * Battle-ready opponents the caller does not own: off cooldown, excluding
 * `excludeOwner`, optionally above a level, paged.
 *
 * Unlike every other read here this one is *merged*, not a projection of chain
 * state, and it has to be: level and cooldown are what it filters, bands and
 * orders on, and both moved to `pet_battle_progress` when battles left the chain
 * (§L Phase 6). Filtering on the roster's frozen columns would offer a pet that
 * climbed to level 20 through backend battles to a level-3 challenger, and would
 * offer a pet that fought thirty seconds ago as available. So the join happens in
 * the query, where the filter can see the merged values — a post-filter can only
 * drop rows a page already contains, which fixes the cooldown and not the band.
 *
 * Two consequences of that:
 *  - There is no gRPC fast path. indexer-go's cache holds chain state and has no
 *    view of `pet_battle_progress` (a backend-owned table it has no business
 *    reading), so it can no longer answer this question correctly. The other
 *    reads here keep theirs: they return chain truth and are merged by the caller.
 *  - When this deployment serves no chain of `params.chain`'s family there is no
 *    progression to join, so the plain roster query below is exactly right.
 *
 * It also drops pets whose owner has granted no standing defence consent (§D).
 * Without that filter matchmaking offers opponents that `acceptBattle` will always
 * refuse with 403 `no-authorization` — and it refuses *after* the attacker has
 * signed the intent, so the player pays a wallet prompt to learn the fight was
 * never possible.
 *
 * The filter is deliberately weaker than `authorizationCovers`, which stays the
 * only thing that authorizes a battle. It checks what does not depend on the
 * attacker (a live, unrevoked, in-window grant covering this pet under the current
 * ruleset) and leaves the level band and the daily cap to accept time, where the
 * attacker is known. So it can still list a pet that then refuses this particular
 * challenger — it can never list one that refuses everybody. Narrowing only:
 * nothing here can permit a battle the protocol rule would not.
 */
export async function findReadyOpponents(
    params: FindOpponentsParams
): Promise<{ rows: RosterPet[]; total: number }> {
    const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
    const chainId = servedChainIdForFamily(params.chain);
    if (!chainId) {
        return findReadyOpponentsFromChainState(params, nowSeconds);
    }

    const deploymentId = servedDeploymentId();
    const rulesetHash = hashRuleset(SOURCE_DEFAULT_RULESET);
    const skip = params.page * params.pageSize;

    // Folded for EVM, exact for base58 — see `ownerKey`, which states the rule once for
    // the three places that need it (here, the leaderboard's grouping, chat's marriage
    // gate). Getting it wrong here would list a pet whose owner never consented.
    const ownerMatch = Prisma.sql`${ownerKey(params.chain, 'r')} = a.defender_owner`;

    // A live grant covering this pet, under the ruleset battles are currently settled
    // under. Level band and daily cap are not here on purpose — see the header.
    const hasConsent = Prisma.sql`
        EXISTS (
            SELECT 1 FROM defense_authorization a
            WHERE a.chain_id = ${chainId}
              AND a.deployment_id = ${deploymentId}
              AND a.ruleset_hash = ${rulesetHash}
              AND a.revoked_at IS NULL
              AND a.not_before <= ${nowSeconds}
              AND a.expires_at > ${nowSeconds}
              AND ${ownerMatch}
              AND (a.all_pets OR a.pet_ids @> to_jsonb(r.pet_id))
        )
    `;

    // COALESCE for xp/win/loss: a progress row supplies those wholesale, matching
    // `overlayRosterPet`. Level and ready_at instead MERGE — GREATEST — because both
    // systems keep writing them: battles raise the row, while paid on-chain
    // train()/levelUp() raise the roster (and breeding still writes ready_at). A
    // COALESCE on level would band and order a battled pet at its stale row level,
    // hiding every level its owner has bought since its first fight.
    const [rows, counted] = await Promise.all([
        prisma.$queryRaw<PetRosterRow[]>`
            SELECT r.chain, r.pet_id AS "petId", r.owner, r.name, r.rarity, r.dna,
                   GREATEST(r.level, COALESCE(p.level, 0)) AS level,
                   COALESCE(p.xp, r.xp) AS xp,
                   COALESCE(p.win_count, r.win_count) AS "winCount",
                   COALESCE(p.loss_count, r.loss_count) AS "lossCount",
                   GREATEST(r.ready_at, COALESCE(p.ready_at, 0::bigint)) AS "readyAt",
                   r.generation, r.parent1_id AS "parent1Id", r.parent2_id AS "parent2Id",
                   r.breed_count AS "breedCount", r.species_id AS "speciesId",
                   r.spouse_id AS "spouseId", r.breed_ready_at AS "breedReadyAt",
                   r.train_ready_at AS "trainReadyAt", r.asset
            FROM pet_roster r
            LEFT JOIN pet_battle_progress p
                ON p.pet_id = r.pet_id
               AND p.chain_id = ${chainId}
               AND p.deployment_id = ${deploymentId}
            WHERE r.chain = ${params.chain}
              AND r.owner <> ${params.excludeOwner}
              AND GREATEST(r.ready_at, COALESCE(p.ready_at, 0::bigint)) <= ${nowSeconds}
              AND GREATEST(r.level, COALESCE(p.level, 0)) >= ${params.minLevel}
              AND ${hasConsent}
            ORDER BY GREATEST(r.level, COALESCE(p.level, 0)) ASC, r.pet_id ASC
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
              AND r.owner <> ${params.excludeOwner}
              AND GREATEST(r.ready_at, COALESCE(p.ready_at, 0::bigint)) <= ${nowSeconds}
              AND GREATEST(r.level, COALESCE(p.level, 0)) >= ${params.minLevel}
              AND ${hasConsent}
        `,
    ]);

    return {
        rows: rows.map(mapRosterRowToRosterPet),
        total: Number(counted[0]?.total ?? 0),
    };
}

/** The same query without progression, for a chain family this deployment does not serve. */
async function findReadyOpponentsFromChainState(
    params: FindOpponentsParams,
    nowSeconds: bigint,
): Promise<{ rows: RosterPet[]; total: number }> {
    const where = {
        chain: params.chain,
        owner: { not: params.excludeOwner },
        readyAt: { lte: nowSeconds },
        ...(params.minLevel > 0 ? { level: { gte: params.minLevel } } : {}),
    };

    const [rows, total] = await Promise.all([
        prisma.petRoster.findMany({
            where,
            orderBy: [{ level: 'asc' }, { petId: 'asc' }],
            skip: params.page * params.pageSize,
            take: params.pageSize,
        }),
        prisma.petRoster.count({ where }),
    ]);

    return { rows: rows.map(mapRosterRowToRosterPet), total };
}

export interface SearchPetsParams {
    chain: Chain;
    /** Name prefix (case-insensitive) or exact numeric pet ID to match. */
    query: string;
    limit: number;
}

/**
 * Search pets by name prefix (ILIKE) or exact numeric ID. Used by the
 * marriage proposal flow so players can find a partner's pet without
 * knowing its ID up front. No cooldown/level filter — any pet matches.
 */
export async function searchPets(params: SearchPetsParams): Promise<RosterPet[]> {
    const { chain, query, limit } = params;
    const trimmed = query.trim();
    if (!trimmed) return [];

    // If the query is a pure integer, do an exact ID match first for speed.
    const isNumeric = /^\d+$/.test(trimmed);

    const rows = await prisma.petRoster.findMany({
        where: {
            chain,
            ...(isNumeric
                ? { petId: trimmed }
                : { name: { contains: trimmed, mode: 'insensitive' } }),
        },
        orderBy: [{ level: 'desc' }, { petId: 'asc' }],
        take: limit,
    });

    return rows.map(mapRosterRowToRosterPet);
}

/**
 * All pets for a given chain, ordered by petId. Used by the incoming-proposals
 * flow so the frontend can batch-check on-chain marriageProposal state for every
 * known pet without a separate search round-trip.
 */
export async function getAllPets(chain: Chain, limit: number): Promise<RosterPet[]> {
    const rows = await prisma.petRoster.findMany({
        where: { chain },
        orderBy: { petId: 'asc' },
        take: limit,
    });
    return rows.map(mapRosterRowToRosterPet);
}

/**
 * A single pet by (chain, petId) for the pet-detail view. Same fail-open shape
 * as the matchmaking read: indexer-go's cache answers first when
 * ROSTER_READ_SOURCE=grpc, otherwise (or on any gRPC fault) Prisma does.
 * Returns null when no such pet exists on either path.
 */
export async function getPetById(chain: Chain, petId: string): Promise<RosterPet | null> {
    const viaGrpc = await tryGrpcGetPetState(chain, petId);
    if (viaGrpc) return viaGrpc;

    const row = await prisma.petRoster.findUnique({
        where: { chain_petId: { chain, petId } },
    });
    return row ? mapRosterRowToRosterPet(row) : null;
}
