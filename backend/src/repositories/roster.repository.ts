import { prisma } from '@config/prisma';
import { tryGrpcFindReadyOpponents, tryGrpcGetPetState } from '../grpc/rosterReads';
import { mapRosterRowToRosterPet } from './roster.mapping';
import type { Chain } from '@typings/chain';

/**
 * Read access layer for the `pet_roster` table. indexer-go is the sole writer
 * now (it owns event decoding + the write-through cache), so the backend only
 * reads here — the matchmaking query, with a gRPC-cache fast path.
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
 * Battle-ready opponents the caller does not own: off cooldown
 * (`readyAt <= now`), excluding `excludeOwner`, optionally above a level, paged.
 *
 * With ROSTER_READ_SOURCE=grpc this is answered from indexer-go's RAM cache
 * first (taking the hottest read off the connection-limited Postgres); any
 * gRPC failure silently falls back to the Prisma query below — fail-open.
 */
export async function findReadyOpponents(
    params: FindOpponentsParams
): Promise<{ rows: RosterPet[]; total: number }> {
    const viaGrpc = await tryGrpcFindReadyOpponents(params);
    if (viaGrpc) return viaGrpc;

    const nowSeconds = Math.floor(Date.now() / 1000);
    const where = {
        chain: params.chain,
        owner: { not: params.excludeOwner },
        readyAt: { lte: BigInt(nowSeconds) },
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

    return {
        rows: rows.map(mapRosterRowToRosterPet),
        total,
    };
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
