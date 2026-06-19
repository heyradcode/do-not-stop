import React from 'react';
import { usePendingBattle, usePendingSolanaBattle } from '@shared/core';
import { useTxErrorToast } from '@hooks/useTxErrorToast';

type PendingBattleNoticeProps = {
    /** Pet to check for an unresolved battle; null/empty renders nothing. */
    petId?: string;
    /** Friendly label for the pet (e.g. its name); falls back to the id. */
    label?: string;
    /**
     * When true, also checks if the current Solana wallet has a pending battle
     * request. Pass only on the fighter's notice (not the opponent's) to avoid
     * duplicate banners — Solana pending is per-wallet, not per-pet.
     */
    checkSolana?: boolean;
};

/**
 * Recovery banner for an interrupted async battle. v2 battle is request → VRF →
 * settle; if the settle tx never lands, the pet stays pending and can't start a
 * new battle. EVM: Settle once VRF has fulfilled, or Cancel beforehand.
 * Solana: recovery is automatic on the next battle attempt.
 */
const PendingBattleNotice: React.FC<PendingBattleNoticeProps> = ({ petId, label, checkSolana = false }) => {
    const pending = usePendingBattle(petId);
    const solanaPending = usePendingSolanaBattle(checkSolana);
    useTxErrorToast(pending.settle.error ?? pending.cancel.error);

    if (!pending.isPending && !solanaPending.isPending) return null;

    const who = label ?? `#${petId}`;

    if (solanaPending.isPending && !pending.isPending) {
        return (
            <div className="pending-battle-notice">
                <p>
                    You have an unresolved battle on Solana. Starting a new battle will
                    resume it automatically.
                </p>
            </div>
        );
    }

    const busy = pending.settle.isPending || pending.cancel.isPending;
    return (
        <div className="pending-battle-notice">
            <p>
                <strong>{who}</strong> has an unresolved battle.
                {pending.canCancel
                    ? ' Settle it once randomness is ready, or cancel it now.'
                    : ' Randomness has arrived — settle to complete the battle.'}
            </p>
            <div className="pending-battle-actions">
                <button type="button" onClick={() => void pending.settle.run()} disabled={busy}>
                    {pending.settle.isPending ? 'Settling…' : 'Settle'}
                </button>
                {pending.canCancel && (
                    <button type="button" onClick={() => void pending.cancel.run()} disabled={busy}>
                        {pending.cancel.isPending ? 'Cancelling…' : 'Cancel'}
                    </button>
                )}
            </div>
        </div>
    );
};

export default PendingBattleNotice;
