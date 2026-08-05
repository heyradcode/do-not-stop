import React from 'react';
import { formatExpiry, type IncomingProposal } from '@shared/core';
import NeonButton from '@components/ui/neon-button';
import styles from '../index.module.css';

type IncomingProposalRowProps = {
    proposal: IncomingProposal;
    targetPetName: (id: string) => string;
    busy: boolean;
    onAccept: (proposal: IncomingProposal) => void;
};

/** A single incoming proposal row in the Accept tab. */
const IncomingProposalRow: React.FC<IncomingProposalRowProps> = ({
    proposal,
    targetPetName,
    busy,
    onAccept,
}) => (
    <li className={styles.proposalCard}>
        <div className={styles.proposalPets}>
            <span className={styles.proposalProposer}>
                {proposal.proposerPetName}{' '}
                <span className={styles.proposalId}>#{proposal.proposerPetId}</span>
            </span>
            <span className={styles.proposalArrow}>â†’</span>
            <span className={styles.proposalTarget}>
                your {targetPetName(proposal.targetPetId)}{' '}
                <span className={styles.proposalId}>#{proposal.targetPetId}</span>
            </span>
        </div>
        <div className={styles.proposalMeta}>
            <span className={styles.proposalExpiry}>Expires {formatExpiry(proposal.expiry)}</span>
            <NeonButton tone="emerald" size="xs" disabled={busy} onClick={() => onAccept(proposal)}>
                Accept
            </NeonButton>
        </div>
    </li>
);

export default IncomingProposalRow;

