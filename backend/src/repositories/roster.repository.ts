import { prisma } from '@config/prisma';
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

/** Upsert a batch of pets in a single transaction. */
export async function upsertManyPets(pets: RosterPet[]): Promise<void> {
    if (pets.length === 0) return;
    await prisma.$transaction(
        pets.map((pet) =>
            prisma.petRoster.upsert({
                where: { chain_petId: { chain: pet.chain, petId: pet.petId } },
                create: pet,
                update: pet,
            }),
        ),
    );
}

export async function countByChain(chain: Chain): Promise<number> {
    return prisma.petRoster.count({ where: { chain } });
}

/**
 * Battle-ready opponents the caller does not own: off cooldown
 * (`readyAt <= now`), excluding `excludeOwner`, optionally above a level, paged.
 */
export async function findReadyOpponents(
    params: FindOpponentsParams
): Promise<{ rows: RosterPet[]; total: number }> {
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
