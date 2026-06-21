import React from 'react';
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

    return (
        <div className="breed-tab-panel">
            <p className="breed-tab-hint">Select two of your pets to breed together.</p>
            <BreedParentsPreview petA={parentA} petB={parentB} />
            <div className="picker">
                <div className="field">
                    <label htmlFor="breed-parent1">First Parent</label>
                    <select id="breed-parent1" value={pet1} onChange={(e) => onPet1Change(e.target.value)}>
                        <option value="">Select pet…</option>
                        {allPets.map(({ id, pet }) => (
                            <option key={id} value={id}>
                                {pet.name} (Lv {pet.level})
                            </option>
                        ))}
                    </select>
                </div>
                <div className="field">
                    <label htmlFor="breed-parent2">Second Parent</label>
                    <select id="breed-parent2" value={pet2} onChange={(e) => onPet2Change(e.target.value)}>
                        <option value="">Select pet…</option>
                        {allPets
                            .filter(({ id }) => id !== pet1)
                            .map(({ id, pet }) => (
                                <option key={id} value={id}>
                                    {pet.name} (Lv {pet.level})
                                </option>
                            ))}
                    </select>
                </div>
            </div>
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
