import { useAccount, useWriteContract, useReadContract, useReadContracts } from 'wagmi';
import { CONTRACT_ADDRESS } from '../config';
import CryptoZombiesABI from '../contracts/CryptoZombies.json';

export interface Zombie {
    name: string;
    dna: bigint;
    level: number;
    readyTime: bigint;
    winCount: number;
    lossCount: number;
    rarity: number;
}

export interface ZombieStats {
    level: number;
    winCount: number;
    lossCount: number;
    rarity: number;
}

export interface BattleStats {
    winCount: number;
    lossCount: number;
    readyTime: bigint;
}

export const useZombiesContract = () => {
    const { address, isConnected } = useAccount();
    const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();

    // Get zombie IDs owned by the user
    const { data: zombieIdsData, refetch: refetchZombieIds } = useReadContract({
        address: CONTRACT_ADDRESS,
        abi: CryptoZombiesABI.abi,
        functionName: 'getZombiesByOwner',
        args: address ? [address] : undefined,
        query: {
            enabled: !!address,
        },
    });

    // Create contracts array for batch reading zombie data
    const zombieContracts = (zombieIdsData as bigint[])?.map((zombieId: bigint) => ({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: CryptoZombiesABI.abi as any,
        functionName: 'getZombie' as const,
        args: [zombieId],
    })) || [];

    // Batch read all zombie data
    const { data: zombiesData, isLoading: isZombiesLoading, error: zombiesError } = useReadContracts({
        contracts: zombieContracts,
        query: {
            enabled: zombieContracts.length > 0,
        },
    });

    // Process zombie data
    const zombies: Zombie[] = zombiesData
        ?.filter((result: any) => result.status === 'success' && result.result)
        .map((result: any) => {
            const zombieData = result.result as any;
            return {
                name: zombieData.name,
                dna: BigInt(zombieData.dna),
                level: Number(zombieData.level),
                readyTime: BigInt(zombieData.readyTime),
                winCount: Number(zombieData.winCount),
                lossCount: Number(zombieData.lossCount),
                rarity: Number(zombieData.rarity),
            } as Zombie;
        }) || [];

    const zombieIds: bigint[] = (zombieIdsData as bigint[]) || [];

    // Contract interaction functions
    const createRandomZombie = (name: string) => {
        return writeContract({
            address: CONTRACT_ADDRESS,
            abi: CryptoZombiesABI.abi,
            functionName: 'createRandomZombie',
            args: [name],
            gas: 500000n,
        });
    };

    const levelUp = (zombieId: bigint) => {
        return writeContract({
            address: CONTRACT_ADDRESS,
            abi: CryptoZombiesABI.abi,
            functionName: 'levelUp',
            args: [zombieId],
            value: 1000000000000000n, // 0.001 ETH
            gas: 200000n,
        });
    };

    const changeName = (zombieId: bigint, newName: string) => {
        return writeContract({
            address: CONTRACT_ADDRESS,
            abi: CryptoZombiesABI.abi,
            functionName: 'changeName',
            args: [zombieId, newName],
            gas: 100000n,
        });
    };

    const battleZombies = (zombieId1: bigint, zombieId2: bigint) => {
        return writeContract({
            address: CONTRACT_ADDRESS,
            abi: CryptoZombiesABI.abi,
            functionName: 'battleZombies',
            args: [zombieId1, zombieId2],
            gas: 300000n,
        });
    };

    const createZombieFromDNA = (zombieId1: bigint, zombieId2: bigint, name: string) => {
        return writeContract({
            address: CONTRACT_ADDRESS,
            abi: CryptoZombiesABI.abi,
            functionName: 'createZombieFromDNA',
            args: [zombieId1, zombieId2, name],
            gas: 500000n,
        });
    };

    const attack = (zombieId: bigint, targetId: bigint) => {
        return writeContract({
            address: CONTRACT_ADDRESS,
            abi: CryptoZombiesABI.abi,
            functionName: 'attack',
            args: [zombieId, targetId],
            gas: 300000n,
        });
    };

    const changeDna = (zombieId: bigint, newDna: bigint) => {
        return writeContract({
            address: CONTRACT_ADDRESS,
            abi: CryptoZombiesABI.abi,
            functionName: 'changeDna',
            args: [zombieId, newDna],
            gas: 100000n,
        });
    };

    // Read functions for individual zombie data
    const getZombie = (zombieId: bigint) => {
        return useReadContract({
            address: CONTRACT_ADDRESS,
            abi: CryptoZombiesABI.abi,
            functionName: 'getZombie',
            args: [zombieId],
            query: {
                enabled: !!zombieId,
            },
        });
    };

    const getZombieStats = (zombieId: bigint) => {
        return useReadContract({
            address: CONTRACT_ADDRESS,
            abi: CryptoZombiesABI.abi,
            functionName: 'getZombieStats',
            args: [zombieId],
            query: {
                enabled: !!zombieId,
            },
        });
    };

    const getBattleStats = (zombieId: bigint) => {
        return useReadContract({
            address: CONTRACT_ADDRESS,
            abi: CryptoZombiesABI.abi,
            functionName: 'getBattleStats',
            args: [zombieId],
            query: {
                enabled: !!zombieId,
            },
        });
    };

    const getTotalZombiesCount = () => {
        return useReadContract({
            address: CONTRACT_ADDRESS,
            abi: CryptoZombiesABI.abi,
            functionName: 'getTotalZombiesCount',
        });
    };

    const getOwnerZombieCount = (owner: string) => {
        return useReadContract({
            address: CONTRACT_ADDRESS,
            abi: CryptoZombiesABI.abi,
            functionName: 'ownerZombieCount',
            args: [owner as `0x${string}`],
            query: {
                enabled: !!owner,
            },
        });
    };

    // Utility functions
    const isReady = (readyTime: bigint): boolean => {
        return Number(readyTime) <= Date.now() / 1000;
    };

    const getRarityColor = (rarity: number): string => {
        const colors = {
            1: '#8B4513', // Common - Brown
            2: '#C0C0C0', // Uncommon - Silver
            3: '#FFD700', // Rare - Gold
            4: '#FF69B4', // Epic - Hot Pink
            5: '#8A2BE2', // Legendary - Blue Violet
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
        // Account info
        address,
        isConnected,

        // Contract state
        zombies,
        zombieIds,
        isLoading: isZombiesLoading,
        contractError: zombiesError,

        // Write functions
        createRandomZombie,
        levelUp,
        changeName,
        battleZombies,
        createZombieFromDNA,
        attack,
        changeDna,

        // Read functions
        getZombie,
        getZombieStats,
        getBattleStats,
        getTotalZombiesCount,
        getOwnerZombieCount,

        // Transaction state
        hash,
        isPending,
        writeError,

        // Refetch functions
        refetchZombieIds,

        // Utility functions
        isReady,
        getRarityColor,
        getRarityName,
    };
};
