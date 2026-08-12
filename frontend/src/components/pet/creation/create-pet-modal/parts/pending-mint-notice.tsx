import React from 'react';
import { usePendingSolanaMint } from '@shared/core';
import NeonButton from '@components/ui/neon-button';
import { useTxErrorToast } from '@hooks/useTxErrorToast';
import styles from '../index.module.css';

/**
 * Recovery banner for an interrupted Solana mint, the counterpart to
 * `PendingBreedNotice`.
 *
 * `commit_mint` creates one `MintRequest` per wallet and a second commit cannot
 * be sent while it exists, so a player whose randomness expired before anyone
 * revealed it cannot mint again at all: the create button would keep failing at
 * the resume step with nothing on screen explaining why. `cancel_mint` clears
 * the request and refunds its rent.
 *
 * The mint fee is not refunded (`cancel_mint` matches `cancel_breed` here), so
 * the copy says so rather than letting a player discover it after clicking.
 */

type Props = {
    /** False on EVM, which has its own settle/cancel path in `useCreatePet`. */
    enabled: boolean;
};

const PendingMintNotice: React.FC<Props> = ({ enabled }) => {
    const pending = usePendingSolanaMint(enabled);
    useTxErrorToast(pending.cancel.error);

    if (!enabled || !pending.isPending) return null;

    return (
        <div className={styles.stuckMint}>
            <p>
                You have an unresolved mint on Solana.
                {pending.canCancel
                    ? ' Its randomness expired, so it can no longer settle. Clear it to mint again — the mint fee is not returned.'
                    : ' Creating a pet will resume it rather than start a new one.'}
            </p>
            {pending.canCancel && (
                <div className={styles.stuckMintActions}>
                    <NeonButton
                        tone="amber"
                        onClick={() => void pending.cancel.run()}
                        disabled={pending.cancel.isPending}
                    >
                        {pending.cancel.isPending ? 'Clearing…' : 'Clear stuck mint'}
                    </NeonButton>
                </div>
            )}
        </div>
    );
};

export default PendingMintNotice;
