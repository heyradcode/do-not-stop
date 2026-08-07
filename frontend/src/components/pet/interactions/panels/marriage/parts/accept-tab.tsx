import React from 'react';
import { type IncomingProposal, type OpponentPet } from '@shared/core';
import IncomingProposalRow from './incoming-proposal-row';
import styles from '../index.module.css';

export type AcceptTabProps = {
    proposals: IncomingProposal[];
    isLoading: boolean;
    busy: boolean;
    /** Every pet on this chain, for resolving a proposal's counterpart to its art. */
    petById: Map<string, OpponentPet>;
    targetPetName: (id: string) => string;
    onAccept: (proposal: IncomingProposal) => void;
};

/** Pending proposals from other players to marry one of the user's pets. */
const AcceptTab: React.FC<AcceptTabProps> = ({
    proposals,
    isLoading,
    busy,
    petById,
    targetPetName,
    onAccept,
}) => (
    <div className={styles.tabPanel}>
        <p className={styles.tabHint}>
            Pending proposals from other players to marry one of your pets.
        </p>

        {isLoading ? (
            <div className={styles.proposalsEmpty}>Checking for proposals…</div>
        ) : proposals.length === 0 ? (
            <div className={styles.proposalsEmpty}>No pending proposals for your pets.</div>
        ) : (
            <ul className={styles.proposalsList}>
                {proposals.map((p) => (
                    <IncomingProposalRow
                        key={`${p.proposerPetId}-${p.targetPetId}`}
                        proposal={p}
                        petById={petById}
                        targetPetName={targetPetName}
                        busy={busy}
                        onAccept={onAccept}
                    />
                ))}
            </ul>
        )}
    </div>
);

export default AcceptTab;
