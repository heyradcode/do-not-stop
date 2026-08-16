import { useEffect, useMemo, useRef, useState } from 'react';
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

import { useMarriedPets, type MarriedPet } from './useMarriedPets';
import { useNotifyError } from '../useNotifyError';

export type MarriageTab = 'propose' | 'accept';

/**
 * How often the Incoming tab re-reads proposals.
 *
 * Sized against the expiry rather than picked for feel: at a 60s TTL this costs at most a
 * sixth of the window, leaving time to read the row and tap Accept. Each tick is one
 * multicall across the roster, so it is not free.
 */
const PROPOSAL_POLL_MS = 10_000;

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
    /** The married subset of `chainPets`, resolved before render; see `useMarriedPets`. */
    marriedPets: MarriedPet[];
    marriagesLoading: boolean;
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
    const { kind, activeKind, parseError } = useChainCapabilities();
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

    const { proposals, isLoading: proposalsLoading, refetch: refetchProposals } =
        useIncomingProposals(activeKind, chainPetIds);

    const { marriedPets, isLoading: marriagesLoading } = useMarriedPets(activeKind, chainPets);

    /**
     * Re-read incoming proposals while the Incoming tab is open.
     *
     * The shared hook caches for 15s and schedules no refetch of its own, and this panel
     * used to drop its `refetch` entirely, so a proposal arriving while the tab was open
     * never appeared: the only way to see one was to leave the screen and come back.
     *
     * That is bad at any expiry and unusable at the current one. `GameConfig.proposalTTL`
     * is 60 seconds on this deployment (its source calls that the dev value and names 7
     * days for production), so a proposal the recipient cannot see for a whole minute is a
     * proposal they cannot accept at all.
     *
     * Only while the tab is showing: polling a screen nobody is reading spends the
     * player's battery and an RPC multicall over every pet in the roster.
     *
     * Held through a ref because the hook builds a fresh `refetch` closure on every
     * render. Depending on it directly would tear the interval down and start a new one
     * each time anything re-rendered, so the full period would restart continuously and
     * the read might never actually fire.
     */
    const refetchProposalsRef = useRef(refetchProposals);
    refetchProposalsRef.current = refetchProposals;

    useEffect(() => {
        if (tab !== 'accept') return;
        const timer = setInterval(() => refetchProposalsRef.current(), PROPOSAL_POLL_MS);
        return () => clearInterval(timer);
    }, [tab]);

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
            /*
             * The chain's own reason, not a generic line.
             *
             * `PetCore.divorce` reverts with "Not the owner of this pet" or "Pet doesn't
             * exist", and `marry`/`acceptProposal` are the same shape. Every one of those
             * tells the player something they can act on, and all of them used to arrive as
             * "Marriage action failed" with the real string logged to a console no player
             * reads. `parseError` is the same one `useTxError` uses, so a user rejection
             * still reads as a rejection rather than as a failure.
             */
            const { message: reason } = parseError(err, 'Marriage action failed');
            notifyError(reason, err, 'marriage');
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
        marriedPets,
        marriagesLoading,
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
