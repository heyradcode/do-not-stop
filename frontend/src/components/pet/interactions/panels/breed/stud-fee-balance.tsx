import React from 'react';
import { useChainCapabilities, useStudFees } from '@shared/core';
import { useTxErrorToast } from '@hooks/useTxErrorToast';

const LAMPORTS_PER_SOL = 1_000_000_000n;

const formatSol = (lamports: bigint): string => {
    const sol = Number(lamports) / Number(LAMPORTS_PER_SOL);
    return `${sol.toFixed(sol < 0.01 ? 6 : 4)} SOL`;
};

/**
 * Shows pending stud fee earnings for married Solana pets and a Withdraw button.
 * Only rendered on Solana when the balance is non-zero.
 */
const StudFeeBalance: React.FC = () => {
    const { activeKind } = useChainCapabilities();
    const { amountLamports, isLoading, withdraw } = useStudFees();
    useTxErrorToast(withdraw.error);

    if (activeKind !== 'solana') return null;
    if (isLoading || amountLamports === null || amountLamports === 0n) return null;

    return (
        <div className="stud-fee-balance">
            <span className="stud-fee-label">
                Stud fee earnings: <strong>{formatSol(amountLamports)}</strong>
            </span>
            <button
                type="button"
                className="stud-fee-withdraw"
                disabled={withdraw.isPending}
                onClick={() => void withdraw.run()}
            >
                {withdraw.isPending ? 'Withdrawing…' : 'Withdraw'}
            </button>
        </div>
    );
};

export default StudFeeBalance;
