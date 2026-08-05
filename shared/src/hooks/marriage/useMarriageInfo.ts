import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useChainCapabilities } from '../session/useChainCapabilities';
import { useMarriageInfo as useEvmMarriageInfo, type MarriageInfo } from '../chains/ethereum/useMarriageInfo';
import { marriageProposalPda } from '../../utils/solana/pdas';
import { getAccountClient } from '../../utils/solana/accountClient';
import { useProgram } from '../chains/solana/useProgram';
import type { Pet } from '../../types/pet';
import type { PublicKey } from '@solana/web3.js';

export type { MarriageInfo };

const useSolanaMarriageInfo = (pet: Pet | undefined): MarriageInfo => {
    const { programId, program, isReady } = useProgram();
    const petId = pet ? parseInt(pet.id) : null;

    const proposalQuery = useQuery({
        queryKey: ['cryptopets', 'marriage-proposal', programId?.toBase58() ?? 'none', petId],
        enabled: Boolean(isReady && program && programId && petId),
        queryFn: async () => {
            const [proposalPda] = marriageProposalPda(programId!, petId!);
            const account = await getAccountClient(program!, 'marriageProposal').fetchNullable(proposalPda);
            if (!account) return null;
            return account as { petAId: number; petBId: number; proposer: PublicKey; expiry: number };
        },
    });

    return useMemo<MarriageInfo>(() => {
        const nowSec = Math.floor(Date.now() / 1000);
        const p = proposalQuery.data;
        const hasProposal = p != null && p.expiry > nowSec;
        const isMarried = Boolean(pet?.spouseId && pet.spouseId !== 0);

        return {
            spouseId: pet?.spouseId ? BigInt(pet.spouseId) : undefined,
            isMarried,
            hasProposal,
            proposalPetIdB: hasProposal && p ? BigInt(p.petBId) : undefined,
            proposer: hasProposal && p ? (p.proposer as PublicKey).toBase58() : undefined,
            proposalExpiry: hasProposal && p ? BigInt(p.expiry) : undefined,
            cooldownUntil: pet?.marriageCooldownUntil ? BigInt(pet.marriageCooldownUntil) : undefined,
            isLoading: proposalQuery.isPending,
            refetch: () => { void proposalQuery.refetch(); },
        };
    }, [pet, proposalQuery]);
};

/**
 * Chain-aware marriage info for a single pet.
 * EVM: reads contract state (marriageOf / marriageProposal / marriageCooldownUntil).
 * Solana: reads from the Pet object (spouseId / marriageCooldownUntil) + fetches proposal account.
 */
export const useMarriageInfo = (pet?: Pet): MarriageInfo => {
    const { kind } = useChainCapabilities();
    const isSolana = kind === 'solana';

    const evmInfo = useEvmMarriageInfo(!isSolana ? pet?.id : undefined);
    const solanaInfo = useSolanaMarriageInfo(isSolana ? pet : undefined);

    return isSolana ? solanaInfo : evmInfo;
};
