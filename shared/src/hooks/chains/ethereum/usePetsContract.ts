import type { Abi } from 'viem';
import { useAccount, useReadContract, useReadContracts } from 'wagmi';

/**
 * Raw PetCore pet tuple (v2 `getPet`). A superset of the v1 shape — the extra
 * v2 fields are read straight off the struct; consumers that only need v1
 * fields can ignore them.
 */
export interface Pet {
    name: string;
    dna: bigint;
    level: number;
    readyTime: bigint;
    winCount: number;
    lossCount: number;
    rarity: number;
    // v2 additions
    xp?: number;
    generation?: number;
    breedCount?: number;
    breedReadyAt?: bigint;
    trainReadyAt?: bigint;
    speciesId?: number;
    parent1Id?: bigint;
    parent2Id?: bigint;
    lastOpponentId?: bigint;
    sameOpponentStreak?: number;
}

type UsePetsContractParams = {
    /** PetCore proxy address (ERC-721 storage). */
    contractAddress?: `0x${string}`;
    abi: Abi;
    enabled?: boolean;
    /** EVM chain ID — forces reads onto this chain regardless of wallet chain. */
    chainId?: number;
};

/**
 * PetCore reads: the caller's pet ids (`getByOwner`) and each pet's record
 * (`getPet`). Writes live in the chain adapter (`useEvmAdapter`), routed across
 * PetCore and GameLogic.
 */
export const usePetsContract = ({
    contractAddress,
    abi,
    enabled = true,
    chainId,
}: UsePetsContractParams) => {
    const { address, isConnected } = useAccount();
    const isContractConfigured = Boolean(contractAddress);
    const canRead = Boolean(address && contractAddress && enabled);
    const safeAddress = (contractAddress ?? '0x0000000000000000000000000000000000000000') as `0x${string}`;

    const { data: petIdsData, refetch: refetchPetIds, error: petIdsError } = useReadContract({
        address: safeAddress,
        abi,
        functionName: 'getByOwner',
        args: address ? [address] : undefined,
        chainId,
        query: {
            enabled: canRead,
        },
    });

    // chainId is embedded per-contract because useReadContracts ignores a
    // top-level chainId prop and always overwrites it with useChainId() (wallet).
    const petReadContracts =
        ((petIdsData as bigint[] | undefined)?.map((petId: bigint) => ({
            address: safeAddress,
            abi,
            functionName: 'getPet' as const,
            args: [petId],
            ...(chainId != null ? { chainId } : {}),
        }))) ?? [];

    const { data: petsData, isLoading: isPetsLoading, error: petsError, refetch: refetchPetsData } = useReadContracts({
        contracts: petReadContracts,
        query: {
            enabled: canRead && petReadContracts.length > 0,
        },
    });

    const pets: Pet[] =
        (petsData as { status: string; result?: unknown }[] | undefined)
            ?.filter((result) => result.status === 'success' && result.result)
            .map((result) => {
                const raw = result.result as Pet;
                return {
                    name: raw.name,
                    dna: BigInt(raw.dna),
                    level: Number(raw.level),
                    readyTime: BigInt(raw.readyTime),
                    winCount: Number(raw.winCount),
                    lossCount: Number(raw.lossCount),
                    rarity: Number(raw.rarity),
                    xp: raw.xp != null ? Number(raw.xp) : undefined,
                    generation: raw.generation != null ? Number(raw.generation) : undefined,
                    breedCount: raw.breedCount != null ? Number(raw.breedCount) : undefined,
                    breedReadyAt: raw.breedReadyAt != null ? BigInt(raw.breedReadyAt) : undefined,
                    trainReadyAt: raw.trainReadyAt != null ? BigInt(raw.trainReadyAt) : undefined,
                    speciesId: raw.speciesId != null ? Number(raw.speciesId) : undefined,
                    parent1Id: raw.parent1Id != null ? BigInt(raw.parent1Id) : undefined,
                    parent2Id: raw.parent2Id != null ? BigInt(raw.parent2Id) : undefined,
                    lastOpponentId: raw.lastOpponentId != null ? BigInt(raw.lastOpponentId) : undefined,
                    sameOpponentStreak: raw.sameOpponentStreak != null ? Number(raw.sameOpponentStreak) : undefined,
                };
            }) || [];

    const petIds: bigint[] = (petIdsData as bigint[]) || [];

    return {
        address,
        isConnected,
        isContractConfigured,
        pets,
        petIds,
        isLoading: canRead && isPetsLoading,
        contractError: petIdsError ?? petsError,
        refetchPetIds,
        refetchPetsData,
    };
};
