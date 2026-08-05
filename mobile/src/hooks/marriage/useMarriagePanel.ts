import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
    useAllPets,
    useChainCapabilities,
    useIncomingProposals,
    useMarriage,
    usePetList,
    type IncomingProposal,
    type OpponentPet,
    type Pet,
    type PetChain,
} from '@shared/core';

import { useNotifyError } from '../useNotifyError';

export type MarriageTab = 'propose' | 'accept';

export type PendingAccept = {
    proposal: IncomingProposal;
    myPetId: string;
};

export interface UseMarriagePanel {
    /** No wallet connected — the screen renders nothing else in this case. */
    isDisconnected: boolean;
    tab: MarriageTab;
    onTabChange: (tab: MarriageTab) => void;
    chain: PetChain | null;
    /** Pets on the active chain only; a marriage cannot cross chains. */
    chainPets: Pet[];
    petById: Map<string, OpponentPet>;
    proposals: IncomingProposal[];
    proposalsLoading: boolean;
    proposalCount: number;
    onPropose: (petIdA: string, petIdB: string) => Promise<boolean>;
    onCancelProposal: (id: string) => void;
    onDivorce: (id: string) => void;
    onOpenAccept: (proposal: IncomingProposal) => void;
    pendingAccept: PendingAccept | null;
    onCancelAccept: () => void;
    onConfirmAccept: () => void;
    busy: boolean;
    isProposing: boolean;
    isAccepting: boolean;
    targetPetName: (id: string) => string;
    success: string | null;
}

/**
 * Headless controller for the marriage screen, ported from
 * `frontend/src/hooks/marriage/useMarriagePanel.ts`.
 *
 * Logic is frontend's unchanged; the return shape is flattened, since frontend
 * groups its fields into three of its own components' prop types.
 */
export const useMarriagePanel = (): UseMarriagePanel => {
    const { kind, activeKind } = useChainCapabilities();
    const { pets, refetch } = usePetList();
    const notifyError = useNotifyError();
    const marriage = useMarriage();
    const queryClient = useQueryClient();

    const [tab, setTab] = useState<MarriageTab>('propose');
    const [pendingAccept, setPendingAccept] = useState<PendingAccept | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const chainPets = useMemo(
        () => (kind === 'none' ? [] : pets.filter((p) => p.chain === (kind as 'evm' | 'solana'))),
        [pets, kind],
    );
    const chainPetIds = useMemo(() => chainPets.map((p) => p.id), [chainPets]);

    // All pets on this chain — used for spouse name lookup in marriage cards.
    const { pets: allRosterPets } = useAllPets(activeKind);
    const petById = useMemo<Map<string, OpponentPet>>(
        () => new Map(allRosterPets.map((p) => [p.id, p])),
        [allRosterPets],
    );

    const { proposals, isLoading: proposalsLoading } = useIncomingProposals(
        activeKind,
        chainPetIds,
    );

    const busy =
        marriage.propose.isPending ||
        marriage.accept.isPending ||
        marriage.cancel.isPending ||
        marriage.divorce.isPending;

    /**
     * Run a marriage write, surface success/error, and refresh on-chain reads.
     * Resolves true on success so callers can reset their own UI.
     */
    const run = async (fn: () => Promise<void>, message: string): Promise<boolean> => {
        setSuccess(null);
        try {
            await fn();
            setSuccess(message);
            refetch();
            // Invalidate the wagmi contract read caches (useReadContract and the
            // useReadContracts multicall) plus the Solana incoming-proposals query,
            // so every marriage row reflects new on-chain state right after a write.
            queryClient.invalidateQueries({ queryKey: ['readContract'] });
            queryClient.invalidateQueries({ queryKey: ['readContracts'] });
            queryClient.invalidateQueries({ queryKey: ['incomingProposals'] });
            return true;
        } catch (err) {
            console.error('[marriage]', err);
            notifyError('Marriage action failed', err, 'marriage');
            return false;
        }
    };

    const targetPetName = (id: string) => chainPets.find((p) => p.id === id)?.name ?? `#${id}`;

    const onConfirmAccept = () => {
        if (!pendingAccept) return;
        const { proposal, myPetId } = pendingAccept;
        run(
            () => marriage.accept.mutateAsync({ petIdA: proposal.proposerPetId, petIdB: myPetId }),
            'Marriage accepted!',
        ).then((ok) => {
            if (ok) setPendingAccept(null);
        });
    };

    return {
        isDisconnected: kind === 'none',
        tab,
        onTabChange: setTab,
        chain: activeKind,
        chainPets,
        petById,
        proposals,
        proposalsLoading,
        proposalCount: proposals.length,
        onPropose: (petIdA, petIdB) =>
            run(() => marriage.propose.mutateAsync({ petIdA, petIdB }), 'Proposal sent!'),
        onCancelProposal: (id) => {
            run(() => marriage.cancel.mutateAsync({ petIdA: id }), 'Proposal cancelled.');
        },
        onDivorce: (id) => {
            run(() => marriage.divorce.mutateAsync({ petId: id }), 'Divorced.');
        },
        onOpenAccept: (proposal) =>
            setPendingAccept({ proposal, myPetId: proposal.targetPetId }),
        pendingAccept,
        onCancelAccept: () => setPendingAccept(null),
        onConfirmAccept,
        busy,
        isProposing: marriage.propose.isPending,
        isAccepting: marriage.accept.isPending,
        targetPetName,
        success,
    };
};
