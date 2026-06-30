import React from 'react';
import { type OpponentPet, type Pet, type PetChain } from '@shared/core';
import MarriageCard from './marriage-card';
import s from '../index.module.css';

type ActiveMarriagesProps = {
    chainPets: Pet[];
    chain: PetChain | null;
    petById: Map<string, OpponentPet>;
    busy: boolean;
    onDivorce: (petId: string) => void;
};

/** "Your marriages" section — one card per married pet (others render nothing). */
const ActiveMarriages: React.FC<ActiveMarriagesProps> = ({
    chainPets,
    chain,
    petById,
    busy,
    onDivorce,
}) => (
    <div className={s.statusSection}>
        <span className={s.statusLabel}>❤ Your marriages</span>
        <ul className={s.list}>
            {chainPets.map((p) => (
                <MarriageCard
                    key={p.id}
                    pet={p}
                    chain={chain}
                    petById={petById}
                    busy={busy}
                    onDivorce={onDivorce}
                />
            ))}
        </ul>
    </div>
);

export default ActiveMarriages;
