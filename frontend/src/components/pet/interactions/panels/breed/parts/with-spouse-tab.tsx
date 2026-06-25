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
}) => {
    const selected = allPets.find(({ id }) => id === spousePetId)?.pet ?? null;

    const cycle = (dir: 1 | -1) => {
        if (allPets.length === 0) return;
        const idx = allPets.findIndex(({ id }) => id === spousePetId);
        const base = idx < 0 ? 0 : idx;
        const next = allPets[(base + dir + allPets.length) % allPets.length];
        onSpousePetChange(next.id);
    };

    return (
        <div className="breed-tab-panel">
            <p className="breed-tab-hint">Cycle to a married pet to breed with its spouse.</p>
            <div className="picker">
                <div className="field">
                    <span className="field-label">Your pet</span>
                    <div className="breed-cycle-select">
                        <button
                            type="button"
                            className="breed-cycle__btn"
                            onClick={() => cycle(-1)}
                            aria-label="Previous pet"
                            disabled={allPets.length === 0}
                        >
                            ◀
                        </button>
                        <div className="breed-cycle-select__current">
                            {selected ? (
                                <>
                                    {selected.name} · Lv {selected.level}
                                    {selected.spouseId ? ` ↔ #${selected.spouseId}` : ''}
                                </>
                            ) : (
                                <span className="spouse-placeholder">Select a pet</span>
                            )}
                        </div>
                        <button
                            type="button"
                            className="breed-cycle__btn"
                            onClick={() => cycle(1)}
                            aria-label="Next pet"
                            disabled={allPets.length === 0}
                        >
                            ▶
                        </button>
                    </div>
                </div>
                <div className="field">
                    <span className="field-label">Partner&apos;s pet</span>
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
                        <label htmlFor="breed-spouse-offspring-name">Offspring Name</label>
                        <input
                            id="breed-spouse-offspring-name"
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
};

export default WithSpouseTab;
