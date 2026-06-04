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

/**
 * A pet owned by another player, returned by the matchmaking API for PvP
 * battles. Carries the opponent's `owner` address/pubkey, which the Solana
 * battle flow needs to derive the defender pet PDA.
 */
export interface OpponentPet extends Pet {
    owner: string;
}
