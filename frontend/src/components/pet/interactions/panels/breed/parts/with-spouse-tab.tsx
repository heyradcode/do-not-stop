import React from 'react';
import type { Pet, PetChain } from '@shared/core';
import PendingBreedNotice from './pending-breed-notice';
import SpouseLabel from './spouse-label';

type WithSpouseTabProps = {
    allPets: { id: string; pet: Pet }[];
    chain: PetChain | null;
    spousePetId: string;
    onSpousePetChange: (id: string) => void;
    childName: string;
    onChildNameChange: (name: string) => void;
    marriageLoading: boolean;
    isMarried: boolean;
    spouseId?: string;
    studFeeLabel: string | null;
    areRelated: boolean;
    /** Hide the pending-breed recovery notice while a breed is settling. */
    showPendingNotices: boolean;
};

/** Breed one of the user's pets with its married partner (cross-owner). */
const WithSpouseTab: React.FC<WithSpouseTabProps> = ({
    allPets,
    chain,
    spousePetId,
    onSpousePetChange,
    childName,
    onChildNameChange,
    marriageLoading,
    isMarried,
    spouseId,
    studFeeLabel,
    areRelated,
    showPendingNotices,
}) => (
    <div className="breed-tab-panel">
        <p className="breed-tab-hint">Select one of your pets to breed with their spouse.</p>
        <div className="picker">
            <div className="field">
                <label>Your pet</label>
                <select value={spousePetId} onChange={(e) => onSpousePetChange(e.target.value)}>
                    <option value="">Select pet…</option>
                    {allPets.map(({ id, pet }) => (
                        <option key={id} value={id}>
                            {pet.name} (Lv {pet.level}){pet.spouseId ? ` ↔ #${pet.spouseId}` : ''}
                        </option>
                    ))}
                </select>
            </div>
            <div className="field">
                <label>Partner&apos;s pet</label>
                <div className="spouse-value">
                    {!spousePetId ? (
                        <span className="spouse-placeholder">— select your pet first —</span>
                    ) : marriageLoading ? (
                        <span className="spouse-placeholder">Checking…</span>
                    ) : spouseId ? (
                        <SpouseLabel chain={chain} spouseId={spouseId} />
                    ) : (
                        <span className="spouse-placeholder">Not married</span>
                    )}
                </div>
            </div>
        </div>

        {/* Not-married hint */}
        {spousePetId && !marriageLoading && !isMarried && (
            <div className="breed-no-married">
                <p>This pet is not married yet.</p>
                <p>
                    Go to the <strong>Marriage</strong> page to propose first.
                </p>
            </div>
        )}

        {/* Married — show stud fee + breed inputs */}
        {spouseId && (
            <>
                {studFeeLabel && (
                    <div className="stud-fee-notice">
                        Stud fee: <strong>{studFeeLabel}</strong> — paid to the spouse owner.
                    </div>
                )}
                {areRelated && (
                    <p className="breed-relative-warning">
                        Your pet and their spouse are relatives and cannot breed together.
                    </p>
                )}
                {/* Only show recovery notice for the user's own pet.
                    The spouse's pet also has a pending flag while the breed
                    is in-flight, but the user can't settle/cancel it and
                    showing those buttons there is confusing. */}
                {showPendingNotices && (
                    <PendingBreedNotice
                        petId={spousePetId || undefined}
                        label={`#${spousePetId}`}
                    />
                )}
                <div className="name-input">
                    <label>Offspring Name</label>
                    <input
                        type="text"
                        value={childName}
                        onChange={(e) => onChildNameChange(e.target.value)}
                        placeholder="Name for the new pet…"
                        maxLength={20}
                    />
                </div>
            </>
        )}
    </div>
);

export default WithSpouseTab;
