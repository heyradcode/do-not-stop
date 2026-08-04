import type { Pet } from '../../types/pet';

export interface EvmRawPet {
    name: string;
    dna: bigint;
    level: number | bigint;
    readyTime: bigint;
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
        // PetCore carries no battle record (§L Phase 6). A pet's real win/loss comes from
        // the backend, merged over this by `useBattleProgress`; zero here means "no backend
        // record yet", which is exactly true for a pet that has never fought.
        winCount: 0,
        lossCount: 0,
        readyAt: Number(raw.readyTime),
        xp: num(raw.xp),
        generation: num(raw.generation),
        breedCount: num(raw.breedCount),
        speciesId: num(raw.speciesId),
        breedReadyAt: num(raw.breedReadyAt),
        trainReadyAt: num(raw.trainReadyAt),
    };
};
