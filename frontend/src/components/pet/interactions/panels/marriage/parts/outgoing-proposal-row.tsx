import React from 'react';
import { formatExpiry, useMarriageInfo, type Pet } from '@shared/core';
import { AuthActionButton } from '@components/common';

type OutgoingProposalRowProps = {
    pet: Pet;
    walletAddress: string | null;
    onCancel: (petId: string) => void;
    busy: boolean;
};

/** A single outgoing proposal row in the Propose tab. Renders nothing unless this
 *  pet has a pending proposal owned by the connected wallet. */
const OutgoingProposalRow: React.FC<OutgoingProposalRowProps> = ({
    pet,
    walletAddress,
    onCancel,
    busy,
}) => {
    const info = useMarriageInfo(pet);
    const isOwn =
        info.hasProposal &&
        walletAddress != null &&
        info.proposer?.toLowerCase() === walletAddress.toLowerCase();
    if (!isOwn) return null;

    const expirySec = info.proposalExpiry ? Number(info.proposalExpiry) : 0;

    return (
        <li className="proposal-card outgoing-proposal">
            <div className="proposal-pets">
                <span className="proposal-proposer">
                    {pet.name} <span className="proposal-id">#{pet.id}</span>
                </span>
                <span className="proposal-arrow">→</span>
                <span className="proposal-target">#{info.proposalPetIdB?.toString()}</span>
            </div>
            <div className="proposal-meta">
                <span className="proposal-expiry">Expires {formatExpiry(expirySec)}</span>
                <AuthActionButton
                    tone="amber"
                    size="xs"
                    onClick={() => onCancel(pet.id)}
                    disabled={busy}
                >
                    Cancel
                </AuthActionButton>
            </div>
        </li>
    );
};

export default OutgoingProposalRow;
