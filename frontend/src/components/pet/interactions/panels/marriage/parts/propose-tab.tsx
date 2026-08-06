import React, { useMemo, useState } from 'react';
import { type OpponentPet, type Pet, type PetChain } from '@shared/core';
import { AuthActionButton } from '@components/common';
import PetSearchDropdown from '@components/ui/pet-search-dropdown';
import PetSelect from '@components/ui/pet-select';
import OutgoingProposalRow from './outgoing-proposal-row';
import styles from '../index.module.css';

export type ProposeTabProps = {
    chainPets: Pet[];
    chain: PetChain | null;
    walletAddress: string | null;
    busy: boolean;
    isProposing: boolean;
    /** Every pet on this chain, for resolving a proposal's counterpart to its art. */
    petById: Map<string, OpponentPet>;
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
    petById,
    onPropose,
    onCancelProposal,
}) => {
    const [myPet, setMyPet] = useState('');
    const petOptions = useMemo(() => chainPets.map((p) => ({ id: p.id, pet: p })), [chainPets]);
    const [partnerId, setPartnerId] = useState('');

    const handlePropose = async () => {
        const ok = await onPropose(myPet, partnerId);
        if (ok) {
            setMyPet('');
            setPartnerId('');
        }
    };

    return (
        <div className={styles.tabPanel}>
            <p className={styles.tabHint}>
                Select one of your pets, then search for your partner&apos;s pet to send a marriage
                proposal.
            </p>
            <div className="picker">
                <div className="field">
                    <label htmlFor="propose-my-pet">Your pet</label>
                    <PetSelect
                        id="propose-my-pet"
                        pets={petOptions}
                        value={myPet}
                        onChange={setMyPet}
                        placeholder="Select your pet..."
                        disabled={busy || chainPets.length === 0}
                    />
                </div>
                <div className="field">
                    <label htmlFor="propose-partner-pet">Partner&apos;s pet</label>
                    <PetSearchDropdown
                        id="propose-partner-pet"
                        chain={chain}
                        value={partnerId}
                        onChange={setPartnerId}
                        placeholder="Search by name or ID…"
                        disabled={busy}
                        excludeIds={myPet ? [myPet] : []}
                    />
                </div>
                <AuthActionButton
                    className={styles.proposeButton}
                    tone="amber"
                    disabled={busy || !myPet || !partnerId}
                    onClick={() => void handlePropose()}
                >
                    {isProposing ? 'Proposing...' : '💍 Send Proposal'}
                </AuthActionButton>
            </div>

            {chainPets.length > 0 && (
                <div className={styles.sentSection}>
                    <span className={styles.sentLabel}>Sent proposals</span>
                    <ul className={styles.proposalsList}>
                        {chainPets.map((p) => (
                            <OutgoingProposalRow
                                key={p.id}
                                pet={p}
                                walletAddress={walletAddress}
                                petById={petById}
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
