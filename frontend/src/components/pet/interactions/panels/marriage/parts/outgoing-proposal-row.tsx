import React from 'react';
import clsx from 'clsx';
import { formatExpiry, useMarriageInfo, type OpponentPet, type Pet } from '@shared/core';
import { AuthActionButton } from '@components/common';
import ProposalPet from './proposal-pet';
import styles from '../index.module.css';

type OutgoingProposalRowProps = {
    pet: Pet;
    walletAddress: string | null;
    petById: Map<string, OpponentPet>;
    onCancel: (petId: string) => void;
    busy: boolean;
};

/** A single outgoing proposal row in the Propose tab. Renders nothing unless this
 *  pet has a pending proposal owned by the connected wallet. */
const OutgoingProposalRow: React.FC<OutgoingProposalRowProps> = ({
    pet,
    walletAddress,
    petById,
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
    const targetId = info.proposalPetIdB?.toString() ?? '';

    return (
        <li className={clsx(styles.proposalCard, styles.outgoing)}>
            <div className={styles.proposalPets}>
                <ProposalPet className={styles.proposalProposer} id={pet.id} pet={pet} />
                <span className={styles.proposalArrow}>â†’</span>
                <ProposalPet
                    className={styles.proposalTarget}
                    id={targetId}
                    pet={petById.get(targetId)}
                />
            </div>
            <div className={styles.proposalMeta}>
                <span className={styles.proposalExpiry}>Expires {formatExpiry(expirySec)}</span>
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

