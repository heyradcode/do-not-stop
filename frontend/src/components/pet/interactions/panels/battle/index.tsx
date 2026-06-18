import React from 'react';
import TransactionStatus from '@components/common/transaction-status';
import BattleOverlay from './parts/battle-overlay';
import BattleSetup from './parts/battle-setup';
import { useBattlePanel } from '@hooks/battle/useBattlePanel';
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
                <p className="pending-hint">
                    Transaction: {hashHint}
                </p>
            )}

            <TransactionStatus lifecycle={receipt} />
        </>
    );
};

export default BattlePanel;
