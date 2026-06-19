import React from 'react';
import { usePendingBreed, usePendingSolanaBreed } from '@shared/core';
import { useTxErrorToast } from '@hooks/useTxErrorToast';

type PendingBreedNoticeProps = {
    /** Parent to check for an unresolved breed; null/empty renders nothing. */
    petId?: string;
    /** Friendly label for the pet (e.g. its name); falls back to the id. */
    label?: string;
    /**
     * When true, also checks if the current Solana wallet has a pending breed
     * request. Pass only once per breed panel to avoid duplicate banners.
     */
    checkSolana?: boolean;
};

/**
 * Recovery banner for an interrupted async breed. v2 breed is request → VRF →
 * settle; if the settle tx never lands, the parents stay pending and can't breed
 * again. EVM: Settle once VRF has fulfilled, or Cancel beforehand.
 * Solana: recovery is automatic on the next breed attempt.
 */
const PendingBreedNotice: React.FC<PendingBreedNoticeProps> = ({ petId, label, checkSolana = false }) => {
    const pending = usePendingBreed(petId);
    const solanaPending = usePendingSolanaBreed(checkSolana);
    useTxErrorToast(pending.settle.error ?? pending.cancel.error);

    if (!pending.isPending && !solanaPending.isPending) return null;

    const who = label ?? `#${petId}`;

    if (solanaPending.isPending && !pending.isPending) {
        return (
            <div className="pending-battle-notice">
                <p>
                    You have an unresolved breed on Solana. Starting a new breed will
                    resume it and mint the offspring automatically.
                </p>
            </div>
        );
    }

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
