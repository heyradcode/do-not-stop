import { prisma } from '../lib/prisma';

/** A roster row as the indexer produces it (pre-persistence). */
export interface RosterPet {
    chain: string;
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

export async function countByChain(chain: string): Promise<number> {
    return prisma.petRoster.count({ where: { chain } });
}
