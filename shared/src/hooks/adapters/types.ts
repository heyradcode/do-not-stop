import type { Pet } from '../../types/pet';

export type TxPhase =
    | 'idle'
    | 'awaiting-wallet'
    | 'confirming'
    | 'awaiting-vrf'
    | 'success'
    | 'error';

export interface TxLifecycle {
    phase: TxPhase;
    hash?: string;
    error: Error | null;
    reset(): void;
}

export interface AdapterMutation<TArgs> {
    mutateAsync(args: TArgs): Promise<void>;
    lifecycle: TxLifecycle;
    isPending: boolean;
}

export interface ChainCapabilities {
    chainLabel: string;
    address: {
        label: string;
        placeholder: string;
        isValid(value: string): boolean;
    };
    /** null when the action is free on this chain. */
    levelUpFee: { amount: string; symbol: string } | null;
    /** Minimum pet level before rename is allowed. */
    renameMinLevel: number;
    randomness: {
        provider: 'chainlink' | 'switchboard';
        appliesTo: ('battle' | 'breed')[];
    };
    explorerTxUrl(hash: string): string | null;
    parseError(error: unknown, fallback: string): { message: string; isUserRejection: boolean; isContractError: boolean };
}

export interface ChainAdapter {
    kind: 'evm' | 'solana' | 'none';
    address: string | null;
    isConnected: boolean;
    capabilities: ChainCapabilities;

    pets: {
        data: Pet[];
        isLoading: boolean;
        error: Error | null;
        refetch(): void;
    };

    // petId is always string; adapters convert to bigint/number internally.
    // dna/rarity are Solana-only; EVM adapters ignore them.
    createPet:   AdapterMutation<{ name: string; dna?: bigint | number | string; rarity?: number }>;
    levelUpPet:  AdapterMutation<{ petId: string }>;
    /** v2 train: pay a level-scaled fee for flat XP. */
    trainPet:    AdapterMutation<{ petId: string }>;
    renamePet:   AdapterMutation<{ petId: string; name: string }>;
    transferPet: AdapterMutation<{ petId: string; to: string }>;
    battlePets:  AdapterMutation<{ petId1: string; petId2: string; defenderOwner?: string }>;
    // crossOwner adds the stud fee (EVM married cross-owner breeding); ignored on Solana.
    breedPets:   AdapterMutation<{ parentId1: string; parentId2: string; name: string; crossOwner?: boolean }>;
}
