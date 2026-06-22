import React, { useMemo, useState } from 'react';
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
import Icon, { CheckIcon } from '@components/ui/icon';
import { Tones } from '@constants/tones';
import MarriageTabBar from './parts/marriage-tab-bar';
import ProposeTab from './parts/propose-tab';
import AcceptTab from './parts/accept-tab';
import ActiveMarriages from './parts/active-marriages';
import AcceptConfirmDialog from './parts/accept-confirm-dialog';
import type { MarriagePanelProps, MarriageTab, PendingAccept } from './types';

const MarriagePanel: React.FC<MarriagePanelProps> = ({ isStandaloneView = true }) => {
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

    if (kind === 'none') {
        return <p>Connect a wallet to use marriage.</p>;
    }

    const targetPetName = (id: string) => chainPets.find((p) => p.id === id)?.name ?? `#${id}`;

    const handlePropose = (petIdA: string, petIdB: string) =>
        run(() => marriage.propose.mutateAsync({ petIdA, petIdB }), 'Proposal sent!');

    const handleCancel = (id: string) =>
        void run(() => marriage.cancel.mutateAsync({ petIdA: id }), 'Proposal cancelled.');

    const handleDivorce = (id: string) =>
        void run(() => marriage.divorce.mutateAsync({ petId: id }), 'Divorced.');

    const handleConfirmAccept = () => {
        if (!pendingAccept) return;
        const { proposal, myPetId } = pendingAccept;
        void run(
            () => marriage.accept.mutateAsync({ petIdA: proposal.proposerPetId, petIdB: myPetId }),
            'Marriage accepted!',
        ).then((ok) => {
            if (ok) setPendingAccept(null);
        });
    };

    const openAccept = (proposal: IncomingProposal) =>
        setPendingAccept({ proposal, myPetId: proposal.targetPetId });

    return (
        <>
            <div className="interface marriage-interface">
                {!isStandaloneView && (
                    <>
                        <h4>💍 Marriage</h4>
                        <p>Marry two pets to unlock cross-owner breeding.</p>
                    </>
                )}

                <MarriageTabBar
                    tab={tab}
                    onChange={setTab}
                    proposalCount={incomingProposals.length}
                />

                {tab === 'propose' && (
                    <ProposeTab
                        chainPets={chainPets}
                        chain={activeKind}
                        walletAddress={walletAddress}
                        busy={busy}
                        isProposing={marriage.propose.isPending}
                        onPropose={handlePropose}
                        onCancelProposal={handleCancel}
                    />
                )}

                {tab === 'accept' && (
                    <AcceptTab
                        proposals={incomingProposals}
                        isLoading={incomingLoading}
                        busy={busy}
                        targetPetName={targetPetName}
                        onAccept={openAccept}
                    />
                )}

                {chainPets.length > 0 && (
                    <ActiveMarriages
                        chainPets={chainPets}
                        chain={activeKind}
                        petById={petById}
                        busy={busy}
                        onDivorce={handleDivorce}
                    />
                )}
            </div>

            {pendingAccept && (
                <AcceptConfirmDialog
                    pending={pendingAccept}
                    targetPetName={targetPetName}
                    busy={busy}
                    isAccepting={marriage.accept.isPending}
                    onCancel={() => setPendingAccept(null)}
                    onConfirm={handleConfirmAccept}
                />
            )}

            {success && (
                <div className="success-message">
                    <Icon as={CheckIcon} tone={Tones.Emerald} />
                    {success}
                </div>
            )}
        </>
    );
};

export default MarriagePanel;
