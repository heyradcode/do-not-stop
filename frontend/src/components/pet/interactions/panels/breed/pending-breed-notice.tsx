import React from 'react';
import { usePendingBreed } from '@shared/core';
import { useTxErrorToast } from '@hooks/useTxErrorToast';

type PendingBreedNoticeProps = {
    /** Parent to check for an unresolved breed; null/empty renders nothing. */
    petId?: string;
    /** Friendly label for the pet (e.g. its name); falls back to the id. */
    label?: string;
};

/**
 * Recovery banner for an interrupted async breed. v2 breed is request → VRF →
 * settle; if the settle tx never lands, the parents stay pending and can't breed
 * again. This lets the player resolve it: Settle once VRF has fulfilled (mints
 * the offspring), or Cancel beforehand.
 */
const PendingBreedNotice: React.FC<PendingBreedNoticeProps> = ({ petId, label }) => {
    const pending = usePendingBreed(petId);
    useTxErrorToast(pending.settle.error ?? pending.cancel.error);

    if (!pending.isPending) return null;

    const who = label ?? `#${petId}`;
    const busy = pending.settle.isPending || pending.cancel.isPending;

    return (
        <div className="pending-battle-notice">
            <p>
                <strong>{who}</strong> has an unresolved breed. Settle it once the
                randomness is ready (mints the offspring), or cancel it if it
                hasn&apos;t arrived yet.
            </p>
            <div className="pending-battle-actions">
                <button type="button" onClick={() => void pending.settle.run()} disabled={busy}>
                    {pending.settle.isPending ? 'Settling…' : 'Settle'}
                </button>
                <button type="button" onClick={() => void pending.cancel.run()} disabled={busy}>
                    {pending.cancel.isPending ? 'Cancelling…' : 'Cancel'}
                </button>
            </div>
        </div>
    );
};

export default PendingBreedNotice;
