import React from 'react';
import clsx from 'clsx';
import { formatExpiry, useMarriageInfo, type Pet } from '@shared/core';
import { AuthActionButton } from '@components/common';
import s from '../index.module.css';

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
        <li className={clsx(s.proposalCard, s.outgoing)}>
            <div className={s.proposalPets}>
                <span className={s.proposalProposer}>
                    {pet.name} <span className={s.proposalId}>#{pet.id}</span>
                </span>
                <span className={s.proposalArrow}>→</span>
                <span className={s.proposalTarget}>#{info.proposalPetIdB?.toString()}</span>
            </div>
            <div className={s.proposalMeta}>
                <span className={s.proposalExpiry}>Expires {formatExpiry(expirySec)}</span>
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
