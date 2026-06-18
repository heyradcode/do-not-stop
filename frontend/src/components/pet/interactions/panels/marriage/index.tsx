import React, { useMemo, useState } from 'react';
import {
    useChainCapabilities,
    useMarriage,
    useMarriageInfo,
    usePetList,
    useIncomingProposals,
    type IncomingProposal,
    type Pet,
} from '@shared/core';
import { useNotifyError } from '@hooks/useNotifyError';
import Icon, { CheckIcon } from '@components/ui/icon';
import PetSearchDropdown from '@components/ui/pet-search-dropdown';
import { Tones } from '@constants/tones';

type MarriageTab = 'propose' | 'accept';

export type MarriagePanelProps = {
    isStandaloneView?: boolean;
};

/** Shows married pets only (not proposals). Used in the always-visible status section. */
const MarriedPetRow: React.FC<{
    pet: Pet;
    onDivorce: (petId: string) => void;
    busy: boolean;
}> = ({ pet, onDivorce, busy }) => {
    const info = useMarriageInfo(pet);
    if (!info.isMarried) return null;
    return (
        <li className="marriage-row">
            <span className="marriage-pet">{pet.name} (#{pet.id})</span>
            <span className="marriage-status">Married to #{info.spouseId?.toString()}</span>
            <button type="button" className="marriage-row-action divorce" onClick={() => onDivorce(pet.id)} disabled={busy}>
                Divorce
            </button>
        </li>
    );
};

/** Shows a single outgoing proposal row in the Propose tab. */
const OutgoingProposalRow: React.FC<{
    pet: Pet;
    walletAddress: string | null;
    onCancel: (petId: string) => void;
    busy: boolean;
}> = ({ pet, walletAddress, onCancel, busy }) => {
    const info = useMarriageInfo(pet);
    const isOwn =
        info.hasProposal && walletAddress != null &&
        info.proposer?.toLowerCase() === walletAddress.toLowerCase();
    if (!isOwn) return null;

    const expirySec = info.proposalExpiry ? Number(info.proposalExpiry) : 0;
    const diff = expirySec - Math.floor(Date.now() / 1000);
    const expiryLabel =
        diff <= 0 ? 'Expired'
        : diff < 3600 ? `${Math.ceil(diff / 60)}m`
        : diff < 86400 ? `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`
        : `${Math.floor(diff / 86400)}d`;

    return (
        <li className="proposal-card outgoing-proposal">
            <div className="proposal-pets">
                <span className="proposal-proposer">{pet.name} <span className="proposal-id">#{pet.id}</span></span>
                <span className="proposal-arrow">→</span>
                <span className="proposal-target">#{info.proposalPetIdB?.toString()}</span>
            </div>
            <div className="proposal-meta">
                <span className="proposal-expiry">Expires {expiryLabel}</span>
                <button
                    type="button"
                    className="marriage-row-action cancel"
                    onClick={() => onCancel(pet.id)}
                    disabled={busy}
                >
                    Cancel
                </button>
            </div>
        </li>
    );
};

const formatExpiry = (expirySec: number) => {
    const diff = expirySec - Math.floor(Date.now() / 1000);
    if (diff <= 0) return 'Expired';
    if (diff < 3600) return `${Math.ceil(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
    return `${Math.floor(diff / 86400)}d`;
};

type PendingAccept = {
    proposal: IncomingProposal;
    myPetId: string;
};

const MarriagePanel: React.FC<MarriagePanelProps> = ({ isStandaloneView = true }) => {
    const { kind, activeKind, walletAddress } = useChainCapabilities();
    const { pets, refetch } = usePetList();
    const notifyError = useNotifyError();
    const marriage = useMarriage();

    const [tab, setTab] = useState<MarriageTab>('propose');
    const [myPet, setMyPet] = useState('');
    const [partnerId, setPartnerId] = useState('');
    const [pendingAccept, setPendingAccept] = useState<PendingAccept | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const chainPets = useMemo(
        () => kind === 'none' ? [] : pets.filter((p) => p.chain === (kind as 'evm' | 'solana')),
        [pets, kind],
    );
    const chainPetIds = useMemo(() => chainPets.map((p) => p.id), [chainPets]);

    const { proposals: incomingProposals, isLoading: incomingLoading } = useIncomingProposals(
        activeKind,
        chainPetIds,
    );

    const busy = marriage.propose.isPending || marriage.accept.isPending
        || marriage.cancel.isPending || marriage.divorce.isPending;

    const run = async (fn: () => Promise<void>, message: string, onSuccess?: () => void) => {
        setSuccess(null);
        try {
            await fn();
            setSuccess(message);
            refetch();
            onSuccess?.();
        } catch (err) {
            console.error('[marriage]', err);
            notifyError('Marriage action failed', err, 'marriage');
        }
    };

    const handleConfirmAccept = () => {
        if (!pendingAccept) return;
        const { proposal, myPetId } = pendingAccept;
        void run(
            () => marriage.accept.mutateAsync({ petIdA: proposal.proposerPetId, petIdB: myPetId }),
            'Marriage accepted!',
            () => setPendingAccept(null),
        );
    };

    if (kind === 'none') {
        return <p>Connect a wallet to use marriage.</p>;
    }

    const targetPetName = (id: string) => chainPets.find((p) => p.id === id)?.name ?? `#${id}`;

    const handleCancel = (id: string) =>
        void run(() => marriage.cancel.mutateAsync({ petIdA: id }), 'Proposal cancelled.');

    return (
        <>
            <div className="interface marriage-interface">
                {!isStandaloneView && (
                    <>
                        <h4>💍 Marriage</h4>
                        <p>Marry two pets to unlock cross-owner breeding.</p>
                    </>
                )}

                {/* Tab bar */}
                <div className="marriage-tabs">
                    <button
                        type="button"
                        className={`marriage-tab${tab === 'propose' ? ' active' : ''}`}
                        onClick={() => setTab('propose')}
                    >
                        💍 Propose
                    </button>
                    <button
                        type="button"
                        className={`marriage-tab${tab === 'accept' ? ' active' : ''}`}
                        onClick={() => setTab('accept')}
                    >
                        💒 Accept
                        {incomingProposals.length > 0 && (
                            <span className="marriage-tab-badge">{incomingProposals.length}</span>
                        )}
                    </button>
                </div>

                {/* Propose tab */}
                {tab === 'propose' && (
                    <div className="marriage-tab-panel">
                        <p className="marriage-tab-hint">Select one of your pets, then search for your partner&apos;s pet to send a marriage proposal.</p>
                        <div className="picker">
                            <div className="field">
                                <label>Your pet</label>
                                <select value={myPet} onChange={(e) => setMyPet(e.target.value)}>
                                    <option value="">Select your pet...</option>
                                    {chainPets.map((p) => (
                                        <option key={p.id} value={p.id}>{p.name} (#{p.id})</option>
                                    ))}
                                </select>
                            </div>
                            <div className="field">
                                <label>Partner&apos;s pet</label>
                                <PetSearchDropdown
                                    chain={activeKind}
                                    value={partnerId}
                                    onChange={setPartnerId}
                                    placeholder="Search by name or ID…"
                                    disabled={busy}
                                    excludeIds={myPet ? [myPet] : []}
                                />
                            </div>
                            <button
                                type="button"
                                className="action-button propose-button"
                                disabled={busy || !myPet || !partnerId}
                                onClick={() => void run(
                                    () => marriage.propose.mutateAsync({ petIdA: myPet, petIdB: partnerId }),
                                    'Proposal sent!',
                                    () => { setMyPet(''); setPartnerId(''); },
                                )}
                            >
                                {marriage.propose.isPending ? 'Proposing...' : '💍 Send Proposal'}
                            </button>
                        </div>

                        {/* Sent proposals list */}
                        {chainPets.length > 0 && (
                            <div className="sent-proposals-section">
                                <span className="sent-proposals-label">Sent proposals</span>
                                <ul className="proposals-list">
                                    {chainPets.map((p) => (
                                        <OutgoingProposalRow
                                            key={p.id}
                                            pet={p}
                                            walletAddress={walletAddress}
                                            busy={busy}
                                            onCancel={handleCancel}
                                        />
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}

                {/* Accept tab */}
                {tab === 'accept' && (
                    <div className="marriage-tab-panel">
                        <p className="marriage-tab-hint">Pending proposals from other players to marry one of your pets.</p>

                        {incomingLoading ? (
                            <div className="proposals-empty">Checking for proposals…</div>
                        ) : incomingProposals.length === 0 ? (
                            <div className="proposals-empty">No pending proposals for your pets.</div>
                        ) : (
                            <ul className="proposals-list">
                                {incomingProposals.map((p) => (
                                    <li key={`${p.proposerPetId}-${p.targetPetId}`} className="proposal-card">
                                        <div className="proposal-pets">
                                            <span className="proposal-proposer">{p.proposerPetName} <span className="proposal-id">#{p.proposerPetId}</span></span>
                                            <span className="proposal-arrow">→</span>
                                            <span className="proposal-target">your {targetPetName(p.targetPetId)} <span className="proposal-id">#{p.targetPetId}</span></span>
                                        </div>
                                        <div className="proposal-meta">
                                            <span className="proposal-expiry">Expires {formatExpiry(p.expiry)}</span>
                                            <button
                                                type="button"
                                                className="marriage-row-action accept-inline"
                                                disabled={busy}
                                                onClick={() => setPendingAccept({ proposal: p, myPetId: p.targetPetId })}
                                            >
                                                Accept
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                {/* Active marriages — always visible */}
                {chainPets.length > 0 && (
                    <div className="marriage-status-section">
                        <span className="marriage-status-label">Your marriages</span>
                        <ul className="marriage-list">
                            {chainPets.map((p) => (
                                <MarriedPetRow
                                    key={p.id}
                                    pet={p}
                                    busy={busy}
                                    onDivorce={(id) => void run(() => marriage.divorce.mutateAsync({ petId: id }), 'Divorced.')}
                                />
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            {/* Confirm accept modal */}
            {pendingAccept && (
                <div className="marriage-confirm-overlay" onClick={() => setPendingAccept(null)}>
                    <div className="marriage-confirm-dialog" onClick={(e) => e.stopPropagation()}>
                        <h5 className="confirm-title">💒 Accept Proposal?</h5>
                        <p className="confirm-body">
                            <strong>{pendingAccept.proposal.proposerPetName}</strong> (#{pendingAccept.proposal.proposerPetId}) will marry your <strong>{targetPetName(pendingAccept.myPetId)}</strong> (#{pendingAccept.myPetId}).
                        </p>
                        <div className="confirm-actions">
                            <button
                                type="button"
                                className="confirm-cancel"
                                onClick={() => setPendingAccept(null)}
                                disabled={busy}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="action-button accept-button confirm-accept"
                                onClick={handleConfirmAccept}
                                disabled={busy}
                            >
                                {marriage.accept.isPending ? 'Accepting...' : '💒 Confirm'}
                            </button>
                        </div>
                    </div>
                </div>
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
