export type PetChain = 'evm' | 'solana';

export type PetAction =
    | 'create'
    | 'levelUp'
    | 'rename'
    | 'battle'
    | 'breed'
    | 'transfer';

export interface Pet {
    id: string;
    chain: PetChain;
    name: string;
    dna: bigint;
    level: number;
    rarity: number;
    winCount: number;
    lossCount: number;
    readyAt: number;
}
