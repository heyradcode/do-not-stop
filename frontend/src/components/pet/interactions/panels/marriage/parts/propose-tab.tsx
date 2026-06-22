import React, { useState } from 'react';
import { type Pet, type PetChain } from '@shared/core';
import { AuthActionButton } from '@components/common';
import PetSearchDropdown from '@components/ui/pet-search-dropdown';
import OutgoingProposalRow from './outgoing-proposal-row';

type ProposeTabProps = {
    chainPets: Pet[];
    chain: PetChain | null;
    walletAddress: string | null;
    busy: boolean;
    isProposing: boolean;
    /** Resolves true on success so the form can reset itself. */
    onPropose: (petIdA: string, petIdB: string) => Promise<boolean>;
    onCancelProposal: (petId: string) => void;
};

/** Compose a new proposal and review proposals already sent. */
const ProposeTab: React.FC<ProposeTabProps> = ({
    chainPets,
    chain,
    walletAddress,
    busy,
    isProposing,
    onPropose,
    onCancelProposal,
}) => {
    const [myPet, setMyPet] = useState('');
    const [partnerId, setPartnerId] = useState('');

    const handlePropose = async () => {
        const ok = await onPropose(myPet, partnerId);
        if (ok) {
            setMyPet('');
            setPartnerId('');
        }
    };

    return (
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
                        chain={chain}
                        value={partnerId}
                        onChange={setPartnerId}
                        placeholder="Search by name or ID…"
                        disabled={busy}
                        excludeIds={myPet ? [myPet] : []}
                    />
                </div>
                <AuthActionButton
                    className="action-button propose-button"
                    disabled={busy || !myPet || !partnerId}
                    onClick={() => void handlePropose()}
                >
                    {isProposing ? 'Proposing...' : '💍 Send Proposal'}
                </AuthActionButton>
            </div>

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
                                onCancel={onCancelProposal}
                            />
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default ProposeTab;
