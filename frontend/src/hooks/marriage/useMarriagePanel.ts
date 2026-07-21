import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
    useChainCapabilities,
    useMarriage,
    useAllPets,
    usePetList,
    useIncomingProposals,
    type IncomingProposal,
    type OpponentPet,
} from '@shared/core';
import { useNotifyError } from '@hooks/useNotifyError';
import type { ProposeTabProps } from '@components/pet/interactions/panels/marriage/parts/propose-tab';
import type { AcceptTabProps } from '@components/pet/interactions/panels/marriage/parts/accept-tab';
import type { ActiveMarriagesProps } from '@components/pet/interactions/panels/marriage/parts/active-marriages';
import type { MarriageTab, PendingAccept } from '@components/pet/interactions/panels/marriage/types';

export interface UseMarriagePanel {
    /** No wallet connected — the panel renders nothing else in this case. */
    isDisconnected: boolean;
    tab: MarriageTab;
    onTabChange: (tab: MarriageTab) => void;
    proposalCount: number;
    proposeTab: ProposeTabProps;
    acceptTab: AcceptTabProps;
    activeMarriages: ActiveMarriagesProps;
    pendingAccept: PendingAccept | null;
    onCancelAccept: () => void;
    onConfirmAccept: () => void;
    busy: boolean;
    isAccepting: boolean;
    targetPetName: (id: string) => string;
    success: string | null;
}

/**
 * Headless controller for the marriage panel — same convention as useBattlePanel
 * and useBreedPanel: owns all state/handlers, the component is a pure view.
 */
export const useMarriagePanel = (): UseMarriagePanel => {
    const { kind, activeKind, walletAddress } = useChainCapabilities();
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

    const { proposals: incomingProposals, isLoading: incomingLoading } = useIncomingProposals(
        activeKind,
        chainPetIds,
    );

    const busy =
        marriage.propose.isPending ||
        marriage.accept.isPending ||
        marriage.cancel.isPending ||
        marriage.divorce.isPending;

    /** Run a marriage write, surface success/error, and refresh on-chain reads.
     *  Resolves true on success so callers can reset their own UI. */
    const run = async (fn: () => Promise<void>, message: string): Promise<boolean> => {
        setSuccess(null);
        try {
            await fn();
            setSuccess(message);
            refetch();
            // Invalidate all wagmi contract read caches (useReadContract + useReadContracts
            // multicall) and the Solana incoming-proposals query so every marriage/proposal
            // row reflects the new on-chain state immediately after any write.
            void queryClient.invalidateQueries({ queryKey: ['readContract'] });
            void queryClient.invalidateQueries({ queryKey: ['readContracts'] });
            void queryClient.invalidateQueries({ queryKey: ['incomingProposals'] });
            return true;
        } catch (err) {
            console.error('[marriage]', err);
            notifyError('Marriage action failed', err, 'marriage');
            return false;
        }
    };

    const targetPetName = (id: string) => chainPets.find((p) => p.id === id)?.name ?? `#${id}`;

    const handlePropose = (petIdA: string, petIdB: string) =>
        run(() => marriage.propose.mutateAsync({ petIdA, petIdB }), 'Proposal sent!');

    const handleCancel = (id: string) =>
        void run(() => marriage.cancel.mutateAsync({ petIdA: id }), 'Proposal cancelled.');

    const handleDivorce = (id: string) =>
        void run(() => marriage.divorce.mutateAsync({ petId: id }), 'Divorced.');

    const onConfirmAccept = () => {
        if (!pendingAccept) return;
        const { proposal, myPetId } = pendingAccept;
        void run(
            () => marriage.accept.mutateAsync({ petIdA: proposal.proposerPetId, petIdB: myPetId }),
            'Marriage accepted!',
        ).then((ok) => {
            if (ok) setPendingAccept(null);
        });
    };

    const onOpenAccept = (proposal: IncomingProposal) =>
        setPendingAccept({ proposal, myPetId: proposal.targetPetId });

    return {
        isDisconnected: kind === 'none',
        tab,
        onTabChange: setTab,
        proposalCount: incomingProposals.length,
        proposeTab: {
            chainPets,
            chain: activeKind,
            walletAddress,
            busy,
            isProposing: marriage.propose.isPending,
            onPropose: handlePropose,
            onCancelProposal: handleCancel,
        },
        acceptTab: {
            proposals: incomingProposals,
            isLoading: incomingLoading,
            busy,
            targetPetName,
            onAccept: onOpenAccept,
        },
        activeMarriages: {
            chainPets,
            chain: activeKind,
            petById,
            busy,
            onDivorce: handleDivorce,
        },
        pendingAccept,
        onCancelAccept: () => setPendingAccept(null),
        onConfirmAccept,
        busy,
        isAccepting: marriage.accept.isPending,
        targetPetName,
        success,
    };
};
