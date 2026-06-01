import { prisma } from '../lib/prisma';

export type PetChain = 'evm' | 'solana';

/** A roster row as the indexer produces it (pre-persistence). */
export interface RosterPet {
    chain: PetChain;
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

export async function countByChain(chain: PetChain): Promise<number> {
    return prisma.petRoster.count({ where: { chain } });
}
