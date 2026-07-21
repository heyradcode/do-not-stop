import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useReadContracts } from 'wagmi';
import bs58 from 'bs58';
import { Buffer } from 'buffer';
import type { PetChain } from '../types/pet';
import { usePetsConfig } from '../contexts/PetsConfigContext';
import { useProgram } from './chains/solana/useProgram';
import { getAccountClient } from '../utils/solana/accountClient';
import { useAllPets } from './useAllPets';

export interface IncomingProposal {
    proposerPetId: string;
    proposerPetName: string;
    proposerOwner: string;
    targetPetId: string;
    expiry: number;
}

export interface UseIncomingProposalsResult {
    proposals: IncomingProposal[];
    isLoading: boolean;
    error: Error | null;
    refetch: () => void;
}

// Anchor discriminator (8) + petAId u32 (4) = offset 12 for petBId.
const MARRIAGE_PROPOSAL_PET_B_OFFSET = 12;
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

/** EVM: batch-read marriageProposal for all known pets; filter by caller's pet IDs. */
const useEvmIncomingProposals = (
    userPetIds: string[],
    enabled: boolean,
): UseIncomingProposalsResult => {
    const { evm } = usePetsConfig();
    const petCore = evm?.petCore.address as `0x${string}` | undefined;
    const abi = useMemo(() => evm?.petCore.abi ?? [], [evm?.petCore.abi]);
    const chainId = evm?.chainId;

    const { pets: allPets, isLoading: petsLoading, error: petsError, refetch: refetchPets } = useAllPets('evm', { enabled });

    const contracts = useMemo(
        () =>
            allPets.map((pet) => ({
                address: petCore!,
                abi,
                functionName: 'marriageProposal' as const,
                args: [BigInt(pet.id)] as const,
                chainId,
            })),
        [allPets, petCore, abi, chainId],
    );

    const {
        data: results,
        isLoading: readsLoading,
        error: readsError,
        refetch: refetchReads,
    } = useReadContracts({
        contracts,
        allowFailure: true,
        query: {
            enabled: enabled && Boolean(petCore) && contracts.length > 0,
            staleTime: 15_000,
        },
    });

    const proposals = useMemo<IncomingProposal[]>(() => {
        if (!results) return [];
        const nowSec = Math.floor(Date.now() / 1000);
        return results.flatMap((entry, i) => {
            if (entry.status !== 'success') return [];
            const raw = entry.result as readonly [bigint, string, bigint] | undefined;
            if (!raw) return [];
            const [petIdB, proposer, expiry] = raw;
            if (!proposer || proposer === ZERO_ADDR) return [];
            if (Number(expiry) <= nowSec) return [];
            const targetId = petIdB.toString();
            if (!userPetIds.includes(targetId)) return [];
            return [{
                proposerPetId: allPets[i].id,
                proposerPetName: allPets[i].name,
                proposerOwner: proposer,
                targetPetId: targetId,
                expiry: Number(expiry),
            }];
        });
    }, [results, allPets, userPetIds]);

    return {
        proposals,
        isLoading: petsLoading || readsLoading,
        error: petsError ?? (readsError as Error | null),
        refetch: () => {
            refetchPets();
            void refetchReads();
        },
    };
};

/** Solana: use getProgramAccounts with memcmp on petBId to find incoming proposals. */
const useSolanaIncomingProposals = (
    userPetIds: string[],
    enabled: boolean,
): UseIncomingProposalsResult => {
    const { programId, program, isReady } = useProgram();
    const { pets: allPets } = useAllPets('solana', { enabled });

    const petsById = useMemo(
        () => new Map(allPets.map((p) => [p.id, p])),
        [allPets],
    );

    const query = useQuery({
        queryKey: [
            'incomingProposals',
            'solana',
            programId?.toBase58() ?? 'none',
            userPetIds.join(','),
        ],
        enabled: enabled && isReady && Boolean(program) && userPetIds.length > 0,
        queryFn: async () => {
            const nowSec = Math.floor(Date.now() / 1000);
            const client = getAccountClient(program!, 'marriageProposal');
            const allProposals: IncomingProposal[] = [];

            for (const targetId of userPetIds) {
                const petBId = parseInt(targetId, 10);
                if (isNaN(petBId)) continue;
                const idBuf = Buffer.alloc(4);
                idBuf.writeUInt32LE(petBId >>> 0, 0);

                const rows = await client.all([{
                    memcmp: {
                        offset: MARRIAGE_PROPOSAL_PET_B_OFFSET,
                        bytes: bs58.encode(idBuf),
                    },
                }]);

                for (const row of rows) {
                    const acc = row.account as {
                        petAId: number;
                        petBId: number;
                        proposer: { toBase58(): string };
                        expiry: number;
                    };
                    if (acc.expiry <= nowSec) continue;
                    const proposerPet = petsById.get(acc.petAId.toString());
                    allProposals.push({
                        proposerPetId: acc.petAId.toString(),
                        proposerPetName: proposerPet?.name ?? `#${acc.petAId}`,
                        proposerOwner: acc.proposer.toBase58(),
                        targetPetId: acc.petBId.toString(),
                        expiry: acc.expiry,
                    });
                }
            }

            return allProposals;
        },
        staleTime: 15_000,
    });

    return {
        proposals: query.data ?? [],
        isLoading: query.isLoading,
        error: query.error as Error | null,
        refetch: query.refetch,
    };
};

/**
 * Find all pending marriage proposals directed at the caller's pets.
 * EVM: batch-reads marriageProposal on-chain via wagmi multicall.
 * Solana: uses getProgramAccounts with a memcmp filter on petBId.
 */
export const useIncomingProposals = (
    chain: PetChain | null,
    userPetIds: string[],
): UseIncomingProposalsResult => {
    const isEvm = chain === 'evm';
    const isSolana = chain === 'solana';

    const evm = useEvmIncomingProposals(userPetIds, isEvm && userPetIds.length > 0);
    const solana = useSolanaIncomingProposals(userPetIds, isSolana && userPetIds.length > 0);

    if (isEvm) return evm;
    if (isSolana) return solana;
    return { proposals: [], isLoading: false, error: null, refetch: () => {} };
};
