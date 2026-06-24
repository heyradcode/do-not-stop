import React from 'react';
import { formatExpiry, type IncomingProposal } from '@shared/core';
import NeonButton from '@components/ui/neon-button';

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
    <li className="proposal-card">
        <div className="proposal-pets">
            <span className="proposal-proposer">
                {proposal.proposerPetName}{' '}
                <span className="proposal-id">#{proposal.proposerPetId}</span>
            </span>
            <span className="proposal-arrow">→</span>
            <span className="proposal-target">
                your {targetPetName(proposal.targetPetId)}{' '}
                <span className="proposal-id">#{proposal.targetPetId}</span>
            </span>
        </div>
        <div className="proposal-meta">
            <span className="proposal-expiry">Expires {formatExpiry(proposal.expiry)}</span>
            <NeonButton tone="emerald" size="xs" disabled={busy} onClick={() => onAccept(proposal)}>
                Accept
            </NeonButton>
        </div>
    </li>
);

export default IncomingProposalRow;
