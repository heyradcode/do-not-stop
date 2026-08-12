import React from 'react';
import { formatExpiry, type IncomingProposal, type OpponentPet } from '@shared/core';
import NeonButton from '@components/ui/neon-button';
import ProposalPet from './proposal-pet';
import styles from '../index.module.css';

type IncomingProposalRowProps = {
    proposal: IncomingProposal;
    petById: Map<string, OpponentPet>;
    targetPetName: (id: string) => string;
    busy: boolean;
    onAccept: (proposal: IncomingProposal) => void;
};

/** A single incoming proposal row in the Accept tab. */
const IncomingProposalRow: React.FC<IncomingProposalRowProps> = ({
    proposal,
    petById,
    targetPetName,
    busy,
    onAccept,
}) => (
    <li className={styles.proposalCard}>
        <div className={styles.proposalPets}>
            <ProposalPet
                className={styles.proposalProposer}
                id={proposal.proposerPetId}
                pet={petById.get(proposal.proposerPetId)}
                name={proposal.proposerPetName}
            />
            <span className={styles.proposalArrow}>→</span>
            <ProposalPet
                className={styles.proposalTarget}
                id={proposal.targetPetId}
                pet={petById.get(proposal.targetPetId)}
                name={targetPetName(proposal.targetPetId)}
                prefix="your "
            />
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

