import React, { useState, useEffect, useRef } from 'react';
import clsx from 'clsx';
import type { TxLifecycle } from '@shared/core';
import { Tones } from '@constants/tones';
import Icon, { CheckIcon } from '@components/ui/icon';
import s from './index.module.css';

interface TransactionStatusProps {
    /** Mutation lifecycle from a `@shared/core` pet hook (e.g. `useTransferPet`). */
    lifecycle: TxLifecycle;
}

const CONFIRMED_DISPLAY_MS = 2000;

/**
 * Phase-driven, chain-neutral transaction toast. Purely presentational:
 * settlement callbacks live in the shared hooks (`onSuccess` options), not
 * here. Visible while the lifecycle is `confirming` (EVM receipt wait) and
 * briefly after the `confirming → success` transition; latches the confirmed
 * display in local state so it survives the lifecycle being reset.
 */
const TransactionStatus: React.FC<TransactionStatusProps> = ({ lifecycle }) => {
    const { phase, hash } = lifecycle;
    const [confirmedHash, setConfirmedHash] = useState<string | null>(null);
    const [dismissed, setDismissed] = useState(false);
    // Hash of the tx currently being confirmed; lets the success latch show
    // the right hash even after the lifecycle resets to idle.
    const confirmingHashRef = useRef<string | null>(null);

    useEffect(() => {
        if (phase === 'confirming' && hash) {
            confirmingHashRef.current = hash;
            setDismissed(false);
            return;
        }
        if (phase === 'success' && confirmingHashRef.current) {
            setConfirmedHash(confirmingHashRef.current);
            confirmingHashRef.current = null;
            return;
        }
        if (phase === 'idle' || phase === 'error') {
            confirmingHashRef.current = null;
        }
    }, [phase, hash]);

    useEffect(() => {
        if (!confirmedHash) return;
        const t = setTimeout(() => setConfirmedHash(null), CONFIRMED_DISPLAY_MS);
        return () => clearTimeout(t);
    }, [confirmedHash]);

    const isConfirming = phase === 'confirming' && !!hash && !dismissed;
    const isConfirmed = confirmedHash !== null;

    if (!isConfirming && !isConfirmed) return null;

    const displayHash = isConfirming ? (hash as string) : (confirmedHash as string);
    const status = isConfirming ? 'confirming' : 'confirmed';

    return (
        <div className={clsx(s.root, s[status])}>
            <div className={s.content}>
                <div className={s.icon}>
                    {isConfirming ? (
                        <div className={s.spinner}></div>
                    ) : (
                        <Icon as={CheckIcon} tone={Tones.Emerald} glow="soft" noGap />
                    )}
                </div>
                <div className={s.text}>
                    <div className={s.title}>
                        {isConfirming ? 'Confirming transaction...' : 'Transaction confirmed!'}
                    </div>
                    <div className={s.hash}>
                        {displayHash.slice(0, 10)}...{displayHash.slice(-8)}
                    </div>
                </div>
                <button
                    className={s.close}
                    onClick={() => {
                        setDismissed(true);
                        setConfirmedHash(null);
                    }}
                >
                    ×
                </button>
            </div>
        </div>
    );
};

export default TransactionStatus;
