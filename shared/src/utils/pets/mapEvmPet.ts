import type { Pet } from '../../types/pet';

export interface EvmRawPet {
    name: string;
    dna: bigint;
    level: number | bigint;
    readyTime: bigint;
    winCount: number | bigint;
    lossCount: number | bigint;
    rarity: number | bigint;
}

export function mapEvmPet(raw: EvmRawPet, tokenId: bigint): Pet {
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
    };
}
