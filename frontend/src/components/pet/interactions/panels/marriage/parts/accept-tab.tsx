import React from 'react';
import { type IncomingProposal } from '@shared/core';
import IncomingProposalRow from './incoming-proposal-row';

type AcceptTabProps = {
    proposals: IncomingProposal[];
    isLoading: boolean;
    busy: boolean;
    targetPetName: (id: string) => string;
    onAccept: (proposal: IncomingProposal) => void;
};

/** Pending proposals from other players to marry one of the user's pets. */
const AcceptTab: React.FC<AcceptTabProps> = ({ proposals, isLoading, busy, targetPetName, onAccept }) => (
    <div className="marriage-tab-panel">
        <p className="marriage-tab-hint">Pending proposals from other players to marry one of your pets.</p>

        {isLoading ? (
            <div className="proposals-empty">Checking for proposals…</div>
        ) : proposals.length === 0 ? (
            <div className="proposals-empty">No pending proposals for your pets.</div>
        ) : (
            <ul className="proposals-list">
                {proposals.map((p) => (
                    <IncomingProposalRow
                        key={`${p.proposerPetId}-${p.targetPetId}`}
                        proposal={p}
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
