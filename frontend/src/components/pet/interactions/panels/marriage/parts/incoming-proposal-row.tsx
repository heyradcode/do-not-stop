import React from 'react';
import { formatExpiry, type IncomingProposal } from '@shared/core';
import NeonButton from '@components/ui/neon-button';
import s from '../index.module.css';

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
    <li className={s.proposalCard}>
        <div className={s.proposalPets}>
            <span className={s.proposalProposer}>
                {proposal.proposerPetName}{' '}
                <span className={s.proposalId}>#{proposal.proposerPetId}</span>
            </span>
            <span className={s.proposalArrow}>→</span>
            <span className={s.proposalTarget}>
                your {targetPetName(proposal.targetPetId)}{' '}
                <span className={s.proposalId}>#{proposal.targetPetId}</span>
            </span>
        </div>
        <div className={s.proposalMeta}>
            <span className={s.proposalExpiry}>Expires {formatExpiry(proposal.expiry)}</span>
            <NeonButton tone="emerald" size="xs" disabled={busy} onClick={() => onAccept(proposal)}>
                Accept
            </NeonButton>
        </div>
    </li>
);

export default IncomingProposalRow;
