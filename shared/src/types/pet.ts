export type PetChain = 'evm' | 'solana';

export type PetAction =
    | 'create'
    | 'levelUp'
    | 'train'
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
    // v2 fields — optional while not every chain/mapper supplies them.
    /** Cumulative experience points (v2 XP/leveling). */
    xp?: number;
    /** Breeding generation: 1 for starters, +1 per generation bred. */
    generation?: number;
    /** Times this pet has been bred (drives the cooldown curve). */
    breedCount?: number;
    /** Species id → tier/skill archetype (v2.1 species grid). */
    speciesId?: number;
    /** Unix seconds until this pet can breed again. */
    breedReadyAt?: number;
    /** Unix seconds until this pet can train again. */
    trainReadyAt?: number;
}

/**
 * A pet owned by another player, returned by the matchmaking API for PvP
 * battles. Carries the opponent's `owner` address/pubkey, which the Solana
 * battle flow needs to derive the defender pet PDA.
 */
export interface OpponentPet extends Pet {
    owner: string;
}
