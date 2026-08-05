import type { Chain } from '@typings/chain';
import type { RosterPet } from './roster.repository';

/**
 * Pure roster-row projections shared by the two read paths. Deliberately free of
 * any env / Prisma / gRPC runtime imports (types only) so both mappers — and the
 * parity between them — are unit-testable without a database or a live indexer.
 *
 * The gRPC and Prisma paths MUST produce an identical `RosterPet` for the same
 * pet; otherwise the read source would change the payload the client sees. The
 * parity test (`roster.mapping.test.ts`) pins that.
 */

/**
 * gRPC wire shape with proto-loader `{ longs: String }`: uint64/int64 arrive as
 * strings, uint32 as numbers (camelCased by `keepCase: false`).
 */
export interface PetWire {
    chain: string;
    petId: string;
    owner: string;
    name: string;
    level: number;
    rarity: number;
    dna: string;
    winCount: number;
    lossCount: number;
    readyAt: string;
    xp: number;
    generation: number;
    parent1Id: string;
    parent2Id: string;
    breedCount: number;
    speciesId: number;
    spouseId: string;
    breedReadyAt: string;
    trainReadyAt: string;
    asset: string;
}

/** The `pet_roster` columns we project — a structural subset of the Prisma row. */
export interface PetRosterRow {
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
    xp: number;
    generation: number;
    parent1Id: string;
    parent2Id: string;
    breedCount: number;
    speciesId: number;
    spouseId: string;
    breedReadyAt: bigint;
    trainReadyAt: bigint;
    asset: string;
}

/** indexer-go cache wire → RosterPet. The bigint cooldowns arrive as strings. */
export function mapPetWireToRosterPet(p: PetWire): RosterPet {
    return {
        chain: p.chain as Chain,
        petId: p.petId,
        owner: p.owner,
        name: p.name,
        level: p.level,
        rarity: p.rarity,
        dna: p.dna,
        winCount: p.winCount,
        lossCount: p.lossCount,
        readyAt: BigInt(p.readyAt),
        xp: p.xp,
        generation: p.generation,
        parent1Id: p.parent1Id,
        parent2Id: p.parent2Id,
        breedCount: p.breedCount,
        speciesId: p.speciesId,
        spouseId: p.spouseId,
        breedReadyAt: BigInt(p.breedReadyAt),
        trainReadyAt: BigInt(p.trainReadyAt),
        asset: p.asset,
    };
}

/** Prisma `pet_roster` row → RosterPet. The cooldowns are already bigint. */
export function mapRosterRowToRosterPet(row: PetRosterRow): RosterPet {
    return {
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
        xp: row.xp,
        generation: row.generation,
        parent1Id: row.parent1Id,
        parent2Id: row.parent2Id,
        breedCount: row.breedCount,
        speciesId: row.speciesId,
        spouseId: row.spouseId,
        breedReadyAt: row.breedReadyAt,
        trainReadyAt: row.trainReadyAt,
        asset: row.asset,
    };
}
