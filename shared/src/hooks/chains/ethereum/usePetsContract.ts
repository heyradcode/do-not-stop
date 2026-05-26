import type { Abi } from 'viem';
import { useAccount, useWriteContract, useReadContract, useReadContracts } from 'wagmi';

export interface Pet {
    name: string;
    dna: bigint;
    level: number;
    readyTime: bigint;
    winCount: number;
    lossCount: number;
    rarity: number;
}

type UsePetsContractParams = {
    contractAddress?: `0x${string}`;
    abi: Abi;
    enabled?: boolean;
};

export const usePetsContract = ({
    contractAddress,
    abi,
    enabled = true,
}: UsePetsContractParams) => {
    const { address, isConnected } = useAccount();
    const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
    const isContractConfigured = Boolean(contractAddress);
    const canRead = Boolean(address && contractAddress && enabled);
    const safeAddress = (contractAddress ?? '0x0000000000000000000000000000000000000000') as `0x${string}`;

    const { data: petIdsData, refetch: refetchPetIds, error: petIdsError } = useReadContract({
        address: safeAddress,
        abi,
        functionName: 'getByOwner',
        args: address ? [address] : undefined,
        query: {
            enabled: canRead,
        },
    });

    const petReadContracts =
        ((petIdsData as bigint[] | undefined)?.map((petId: bigint) => ({
            address: safeAddress,
            abi,
            functionName: 'getById' as const,
            args: [petId],
        }))) ?? [];

    const { data: petsData, isLoading: isPetsLoading, error: petsError } = useReadContracts({
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
                };
            }) || [];

    const petIds: bigint[] = (petIdsData as bigint[]) || [];

    const createRandomPet = (name: string) => {
        return writeContract({
            address: safeAddress,
            abi,
            functionName: 'createRandom',
            args: [name],
            gas: 500000n,
        });
    };

    const levelUp = (petId: bigint) => {
        return writeContract({
            address: safeAddress,
            abi,
            functionName: 'levelUp',
            args: [petId],
            value: 1000000000000000n,
            gas: 200000n,
        } as unknown as Parameters<typeof writeContract>[0]);
    };

    const changeName = (petId: bigint, newName: string) => {
        return writeContract({
            address: safeAddress,
            abi,
            functionName: 'changeName',
            args: [petId, newName],
            gas: 100000n,
        });
    };

    const battlePets = (petId1: bigint, petId2: bigint) => {
        return writeContract({
            address: safeAddress,
            abi,
            functionName: 'battle',
            args: [petId1, petId2],
            gas: 300000n,
        });
    };

    /** Chainlink VRF: first tx requests randomness; fulfillment mints the child (local Hardhat uses mock + second tx). */
    const requestBreedFromDNA = (parentId1: bigint, parentId2: bigint, name: string) => {
        return writeContract({
            address: safeAddress,
            abi,
            functionName: 'requestCreateFromDNA',
            args: [parentId1, parentId2, name],
            gas: 800000n,
        });
    };

    const attack = (petId: bigint, targetId: bigint) => {
        return writeContract({
            address: safeAddress,
            abi,
            functionName: 'attack',
            args: [petId, targetId],
            gas: 300000n,
        });
    };

    const changeDna = (petId: bigint, newDna: bigint) => {
        return writeContract({
            address: safeAddress,
            abi,
            functionName: 'changeDna',
            args: [petId, newDna],
            gas: 100000n,
        });
    };

    const transferPet = (to: string, petId: bigint) => {
        return writeContract({
            address: safeAddress,
            abi,
            functionName: 'transferFrom',
            args: [address, to as `0x${string}`, petId],
            gas: 200000n,
        });
    };

    const getPet = (petId: bigint) => {
        return useReadContract({
            address: safeAddress,
            abi,
            functionName: 'getById',
            args: [petId],
            query: {
                enabled: !!petId && canRead,
            },
        });
    };

    const getPetStats = (petId: bigint) => {
        return useReadContract({
            address: safeAddress,
            abi,
            functionName: 'getStats',
            args: [petId],
            query: {
                enabled: !!petId && canRead,
            },
        });
    };

    const getBattleStats = (petId: bigint) => {
        return useReadContract({
            address: safeAddress,
            abi,
            functionName: 'getBattleStats',
            args: [petId],
            query: {
                enabled: !!petId && canRead,
            },
        });
    };

    const getTotalPetsCount = () => {
        return useReadContract({
            address: safeAddress,
            abi,
            functionName: 'getTotalCount',
            query: {
                enabled: canRead,
            },
        });
    };

    const getOwnerPetCount = (owner: string) => {
        return useReadContract({
            address: safeAddress,
            abi,
            functionName: 'ownerPetCount',
            args: [owner as `0x${string}`],
            query: {
                enabled: !!owner && canRead,
            },
        });
    };

    const isReady = (readyTime: bigint): boolean => {
        return Number(readyTime) <= Date.now() / 1000;
    };

    const getRarityColor = (rarity: number): string => {
        const colors = {
            1: '#8B4513',
            2: '#C0C0C0',
            3: '#FFD700',
            4: '#FF69B4',
            5: '#8A2BE2',
        };
        return colors[rarity as keyof typeof colors] || '#8B4513';
    };

    const getRarityName = (rarity: number): string => {
        const names = {
            1: 'Common',
            2: 'Uncommon',
            3: 'Rare',
            4: 'Epic',
            5: 'Legendary',
        };
        return names[rarity as keyof typeof names] || 'Unknown';
    };

    return {
        address,
        isConnected,
        isContractConfigured,
        pets,
        petIds,
        isLoading: canRead && isPetsLoading,
        contractError: petIdsError ?? petsError,
        createRandomPet,
        levelUp,
        changeName,
        battlePets,
        requestBreedFromDNA,
        attack,
        changeDna,
        transferPet,
        getPet,
        getPetStats,
        getBattleStats,
        getTotalPetsCount,
        getOwnerPetCount,
        hash,
        txHash: hash,
        isPending,
        isWritePending: isPending,
        isConfirming: false,
        writeError,
        refetchPetIds,
        isReady,
        getRarityColor,
        getRarityName,
    };
};
