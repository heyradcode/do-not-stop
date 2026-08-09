import React from 'react';
import clsx from 'clsx';
import type { OpponentPet, Pet } from '@shared/core';

import PetArt from '@components/pet/pet-art';
import styles from '../index.module.css';

type ProposalPetProps = {
    /** The pet's id, which is all a proposal or a marriage record carries. */
    id: string;
    /**
     * The full record, when the chain roster has it. Art needs the pet's `dna`, and so
     * does the emoji fallback, so an unresolved counterpart shows neither.
     */
    pet?: OpponentPet | Pet;
    /** Falls back to `#id` when the roster has not resolved the pet. */
    name?: string;
    /** e.g. `your ` for the side of a proposal the reader owns. */
    prefix?: string;
    className?: string;
};

/**
 * One side of a proposal or marriage: the pet's art, its name, and its id.
 *
 * The art is conditional because these rows identify pets the reader may not own. A
 * proposal carries ids; the full record comes from the chain roster, and a pet indexed
 * moments ago may not be in it yet. Rather than hold a slot open for art that will never
 * arrive, the row falls back to exactly what it rendered before: name and id.
 */
const ProposalPet: React.FC<ProposalPetProps> = ({ id, pet, name, prefix, className }) => (
    <span className={clsx(styles.proposalPet, className)}>
        {pet && (
            <span className={styles.proposalArt} aria-hidden>
                <PetArt pet={pet} />
            </span>
        )}
        <span className={styles.proposalPetText}>
            {prefix}
            {name ?? pet?.name ?? `#${id}`} <span className={styles.proposalId}>#{id}</span>
        </span>
    </span>
);

export default ProposalPet;
