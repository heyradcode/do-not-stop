import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    useChainCapabilities,
    useMarriage,
    useMarriageInfo,
    usePetList,
    type Pet,
} from '@shared/core';
import { DASHBOARD_HOME } from '@constants/interactionRoutes';
import { useNotifyError } from '@hooks/useNotifyError';
import Icon, { CheckIcon } from '@components/ui/icon';
import { Tones } from '@constants/tones';

type MarriageTab = 'propose' | 'accept';

export type MarriagePanelProps = {
    isStandaloneView?: boolean;
};

const MarriagePetRow: React.FC<{
    pet: Pet;
    walletAddress: string | null;
    onDivorce: (petId: string) => void;
    onCancel: (petId: string) => void;
    busy: boolean;
}> = ({ pet, walletAddress, onDivorce, onCancel, busy }) => {
    const info = useMarriageInfo(pet);
    const ownProposal =
        info.hasProposal && walletAddress != null &&
        info.proposer?.toLowerCase() === walletAddress.toLowerCase();

    let status = 'Single';
    if (info.isMarried) status = `Married to #${info.spouseId?.toString()}`;
    else if (ownProposal) status = `Proposal pending → #${info.proposalPetIdB?.toString()}`;

    const showAny = info.isMarried || ownProposal;
    if (!showAny) return null;

    return (
        <li className="marriage-row">
            <span className="marriage-pet">{pet.name} (#{pet.id})</span>
            <span className="marriage-status">{status}</span>
            {info.isMarried && (
                <button type="button" className="marriage-row-action divorce" onClick={() => onDivorce(pet.id)} disabled={busy}>Divorce</button>
            )}
            {ownProposal && (
                <button type="button" className="marriage-row-action cancel" onClick={() => onCancel(pet.id)} disabled={busy}>Cancel</button>
            )}
        </li>
    );
};

const MarriagePanel: React.FC<MarriagePanelProps> = ({ isStandaloneView = true }) => {
    const navigate = useNavigate();
    const { kind, walletAddress } = useChainCapabilities();
    const { pets, refetch } = usePetList();
    const notifyError = useNotifyError();
    const marriage = useMarriage();

    const [tab, setTab] = useState<MarriageTab>('propose');
    const [myPet, setMyPet] = useState('');
    const [partnerId, setPartnerId] = useState('');
    const [acceptMyPet, setAcceptMyPet] = useState('');
    const [proposerId, setProposerId] = useState('');
    const [success, setSuccess] = useState<string | null>(null);

    const chainPets = useMemo(
        () => kind === 'none' ? [] : pets.filter((p) => p.chain === (kind as 'evm' | 'solana')),
        [pets, kind],
    );
    const busy = marriage.propose.isPending || marriage.accept.isPending
        || marriage.cancel.isPending || marriage.divorce.isPending;

    const run = async (fn: () => Promise<void>, message: string) => {
        setSuccess(null);
        try {
            await fn();
            setSuccess(message);
            refetch();
        } catch (err) {
            console.error('[marriage]', err);
            notifyError('Marriage action failed', err, 'marriage');
        }
    };

    if (kind === 'none') {
        return <p>Connect a wallet to use marriage.</p>;
    }

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
                    </button>
                </div>

                {/* Tab content */}
                {tab === 'propose' && (
                    <div className="marriage-tab-panel">
                        <p className="marriage-tab-hint">Select one of your pets and enter your partner&apos;s pet ID to send a marriage proposal.</p>
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
                                <label>Partner&apos;s pet ID</label>
                                <input
                                    value={partnerId}
                                    onChange={(e) => setPartnerId(e.target.value)}
                                    placeholder="e.g. 42"
                                    inputMode="numeric"
                                />
                            </div>
                            <button
                                type="button"
                                className="action-button propose-button"
                                disabled={busy || !myPet || !partnerId.trim()}
                                onClick={() => run(
                                    () => marriage.propose.mutateAsync({ petIdA: myPet, petIdB: partnerId.trim() }),
                                    'Proposal sent!',
                                )}
                            >
                                {marriage.propose.isPending ? 'Proposing...' : '💍 Send Proposal'}
                            </button>
                        </div>
                    </div>
                )}

                {tab === 'accept' && (
                    <div className="marriage-tab-panel">
                        <p className="marriage-tab-hint">Enter the proposer&apos;s pet ID and select which of your pets to marry them with.</p>
                        <div className="picker">
                            <div className="field">
                                <label>Your pet</label>
                                <select value={acceptMyPet} onChange={(e) => setAcceptMyPet(e.target.value)}>
                                    <option value="">Select your pet...</option>
                                    {chainPets.map((p) => (
                                        <option key={p.id} value={p.id}>{p.name} (#{p.id})</option>
                                    ))}
                                </select>
                            </div>
                            <div className="field">
                                <label>Proposer&apos;s pet ID</label>
                                <input
                                    value={proposerId}
                                    onChange={(e) => setProposerId(e.target.value)}
                                    placeholder="e.g. 7"
                                    inputMode="numeric"
                                />
                            </div>
                            <button
                                type="button"
                                className="action-button accept-button"
                                disabled={busy || !acceptMyPet || !proposerId.trim()}
                                onClick={() => run(
                                    () => marriage.accept.mutateAsync({ petIdA: proposerId.trim(), petIdB: acceptMyPet }),
                                    'Marriage accepted!',
                                )}
                            >
                                {marriage.accept.isPending ? 'Accepting...' : '💒 Accept Proposal'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Status list — always visible */}
                {chainPets.length > 0 && (
                    <div className="marriage-status-section">
                        <span className="marriage-status-label">Your marriages &amp; proposals</span>
                        <ul className="marriage-list">
                            {chainPets.map((p) => (
                                <MarriagePetRow
                                    key={p.id}
                                    pet={p}
                                    walletAddress={walletAddress}
                                    busy={busy}
                                    onDivorce={(id) => run(() => marriage.divorce.mutateAsync({ petId: id }), 'Divorced.')}
                                    onCancel={(id) => run(() => marriage.cancel.mutateAsync({ petIdA: id }), 'Proposal cancelled.')}
                                />
                            ))}
                        </ul>
                    </div>
                )}

                <div className="action-controls">
                    <button type="button" onClick={() => navigate(DASHBOARD_HOME)} className="cancel-button">
                        Done
                    </button>
                </div>
            </div>

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
