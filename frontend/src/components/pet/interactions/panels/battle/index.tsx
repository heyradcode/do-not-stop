import React from 'react';
import TransactionStatus from '@components/common/transaction-status';
import BattleOverlay from './parts/battle-overlay';
import BattleSetup from './parts/battle-setup';
import { useBattlePanel } from './hooks/useBattlePanel';
import './index.css';

export type BattlePanelProps = {
    /** `false` when embedded under the dashboard interactions hub. */
    isStandaloneView?: boolean;
};

const BattlePanel: React.FC<BattlePanelProps> = ({ isStandaloneView = true }) => {
    const { overlay, setup, hashHint, receipt } = useBattlePanel({ isStandaloneView });

    return (
        <>
            <BattleOverlay {...overlay} />
            <BattleSetup {...setup} />

            {hashHint && (
                <p className="breed-pending-hint" style={{ marginTop: '0.75rem', fontSize: '0.9rem', opacity: 0.85 }}>
                    Transaction: {hashHint}
                </p>
            )}

            {receipt.show && receipt.hash && (
                <TransactionStatus
                    hash={receipt.hash}
                    onComplete={receipt.onComplete}
                    onError={receipt.onError}
                />
            )}
        </>
    );
};

export default BattlePanel;
