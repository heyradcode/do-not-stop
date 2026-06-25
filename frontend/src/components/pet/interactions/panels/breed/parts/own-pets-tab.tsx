import React, { useEffect } from 'react';
import type { Pet } from '@shared/core';
import PendingBreedNotice from './pending-breed-notice';
import BreedParentsPreview from './breed-parents-preview';

type OwnPetsTabProps = {
    petCount: number;
    allPets: { id: string; pet: Pet }[];
    pet1: string;
    pet2: string;
    childName: string;
    onPet1Change: (id: string) => void;
    onPet2Change: (id: string) => void;
    onChildNameChange: (name: string) => void;
    areRelated: boolean;
    /** Hide the pending-breed recovery notices while a breed is settling. */
    showPendingNotices: boolean;
};

/** Breed two of the user's own pets together. */
const OwnPetsTab: React.FC<OwnPetsTabProps> = ({
    petCount,
    allPets,
    pet1,
    pet2,
    childName,
    onPet1Change,
    onPet2Change,
    onChildNameChange,
    areRelated,
    showPendingNotices,
}) => {
    // Show a matchup immediately: default to the first two pets when nothing is
    // chosen (mirrors the mock, where two parents are always on the table).
    useEffect(() => {
        if (petCount >= 2 && allPets.length >= 2 && !pet1 && !pet2) {
            onPet1Change(allPets[0].id);
            onPet2Change(allPets[1].id);
        }
    }, [petCount, allPets, pet1, pet2, onPet1Change, onPet2Change]);

    if (petCount < 2) {
        return (
            <div className="breed-tab-panel">
                <div className="breed-no-married">
                    <p>You need at least 2 pets to breed here.</p>
                    <p>
                        Use the <strong>With Spouse</strong> tab if your pet is married.
                    </p>
                </div>
            </div>
        );
    }

    const parentA = allPets.find(({ id }) => id === pet1)?.pet ?? null;
    const parentB = allPets.find(({ id }) => id === pet2)?.pet ?? null;

    /** Cycle `current` through the pets not held by the other parent. */
    const cycle = (
        current: string,
        other: string,
        dir: 1 | -1,
        setter: (id: string) => void,
    ) => {
        const pool = allPets.filter(({ id }) => id !== other);
        if (pool.length === 0) return;
        const idx = pool.findIndex(({ id }) => id === current);
        const base = idx < 0 ? 0 : idx;
        const next = pool[(base + dir + pool.length) % pool.length];
        setter(next.id);
    };

    return (
        <div className="breed-tab-panel">
            <p className="breed-tab-hint">Cycle each side to choose two of your pets to breed.</p>
            <BreedParentsPreview
                petA={parentA}
                petB={parentB}
                onPrevA={() => cycle(pet1, pet2, -1, onPet1Change)}
                onNextA={() => cycle(pet1, pet2, 1, onPet1Change)}
                onPrevB={() => cycle(pet2, pet1, -1, onPet2Change)}
                onNextB={() => cycle(pet2, pet1, 1, onPet2Change)}
            />
            {areRelated && (
                <p className="breed-relative-warning">
                    These pets are relatives and cannot breed together.
                </p>
            )}
            {showPendingNotices && (
                <>
                    <PendingBreedNotice petId={pet1 || undefined} label={`#${pet1}`} checkSolana />
                    <PendingBreedNotice petId={pet2 || undefined} label={`#${pet2}`} />
                </>
            )}
            <div className="name-input">
                <label htmlFor="breed-offspring-name">Offspring Name</label>
                <input
                    id="breed-offspring-name"
                    type="text"
                    value={childName}
                    onChange={(e) => onChildNameChange(e.target.value)}
                    placeholder="Name for the new pet…"
                    maxLength={20}
                />
            </div>
        </div>
    );
};

export default OwnPetsTab;
