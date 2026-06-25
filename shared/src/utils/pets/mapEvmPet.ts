import type { Pet } from '../../types/pet';

export interface EvmRawPet {
    name: string;
    dna: bigint;
    level: number | bigint;
    readyTime: bigint;
    winCount: number | bigint;
    lossCount: number | bigint;
    rarity: number | bigint;
    // v2 fields (PetCore getPet); optional for back-compat with v1 reads.
    xp?: number | bigint;
    generation?: number | bigint;
    breedCount?: number | bigint;
    speciesId?: number | bigint;
    breedReadyAt?: bigint;
    trainReadyAt?: bigint;
}

const num = (v: number | bigint | undefined): number | undefined =>
    v != null ? Number(v) : undefined;

export const mapEvmPet = (raw: EvmRawPet, tokenId: bigint): Pet => {
    return {
        id: tokenId.toString(),
        chain: 'evm',
        name: raw.name,
        dna: BigInt(raw.dna),
        level: Number(raw.level),
        rarity: Number(raw.rarity),
        winCount: Number(raw.winCount),
        lossCount: Number(raw.lossCount),
        readyAt: Number(raw.readyTime),
        xp: num(raw.xp),
        generation: num(raw.generation),
        breedCount: num(raw.breedCount),
        speciesId: num(raw.speciesId),
        breedReadyAt: num(raw.breedReadyAt),
        trainReadyAt: num(raw.trainReadyAt),
    };
};
