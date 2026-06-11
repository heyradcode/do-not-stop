import { prisma } from '@config/prisma';
import { tryGrpcFindReadyOpponents } from '../grpc/rosterReads';
import type { Chain } from '@typings/chain';

/**
 * Single data-access layer for the `pet_roster` table. Both the indexer (writes)
 * and the battle feature (reads) go through here, so all roster queries live in
 * one place.
 */

/** A roster row (also the shape the indexer upserts). */
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
 * Upsert one pet keyed by (chain, petId). On transfer the owner changes but the
 * id is stable, so an upsert keeps the row correct without orphaning.
 */
export async function upsertPet(pet: RosterPet): Promise<void> {
    await prisma.petRoster.upsert({
        where: { chain_petId: { chain: pet.chain, petId: pet.petId } },
        create: pet,
        update: pet,
    });
}

/** Bounds concurrent upserts so a large scan can't exhaust the connection pool. */
const UPSERT_BATCH_SIZE = 25;

/** Upsert a batch of pets, `UPSERT_BATCH_SIZE` at a time. */
export async function upsertManyPets(pets: RosterPet[]): Promise<void> {
    for (let i = 0; i < pets.length; i += UPSERT_BATCH_SIZE) {
        await Promise.all(pets.slice(i, i + UPSERT_BATCH_SIZE).map(upsertPet));
    }
}

export async function countByChain(chain: Chain): Promise<number> {
    return prisma.petRoster.count({ where: { chain } });
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
        rows: rows.map((row) => ({
            chain: row.chain as Chain,
            petId: row.petId,
            owner: row.owner,
            name: row.name,
            level: row.level,
            rarity: row.rarity,
            dna: row.dna,
            winCount: row.winCount,
            lossCount: row.lossCount,
            readyAt: row.readyAt,
        })),
        total,
    };
}
