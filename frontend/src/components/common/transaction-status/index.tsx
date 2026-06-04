import React, { useState, useEffect, useRef } from 'react';
import { useWaitForTransactionReceipt } from 'wagmi';
import { Tones } from '@constants/tones';
import Icon, { CheckIcon, CloseIcon, HourglassIcon } from '@components/common/icon';
import './index.css';

interface TransactionStatusProps {
    hash: string | undefined;
    onComplete?: () => void;
    onError?: (error: Error) => void;
}

const TransactionStatus: React.FC<TransactionStatusProps> = ({
    hash,
    onComplete,
    onError
}) => {
    const [isVisible, setIsVisible] = useState(false);
    const [status, setStatus] = useState<'pending' | 'confirming' | 'confirmed' | 'error'>('pending');

    const onCompleteRef = useRef(onComplete);
    const onErrorRef = useRef(onError);
    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;

    // Prevents the effect from firing onComplete/onError more than once per tx.
    const completedRef = useRef(false);

    const { isLoading: isConfirming, isSuccess: isConfirmed, error } = useWaitForTransactionReceipt({
        hash: hash as `0x${string}`,
    });

    useEffect(() => {
        if (hash) {
            setIsVisible(true);
            setStatus('pending');
            completedRef.current = false;
        }
    }, [hash]);

    useEffect(() => {
        if (isConfirming) {
            setStatus('confirming');
            return;
        }
        if (isConfirmed && !completedRef.current) {
            completedRef.current = true;
            setStatus('confirmed');
            const t = setTimeout(() => {
                setIsVisible(false);
                onCompleteRef.current?.();
            }, 2000);
            return () => clearTimeout(t);
        }
        if (error && !completedRef.current) {
            completedRef.current = true;
            setStatus('error');
            onErrorRef.current?.(error);
            const t = setTimeout(() => setIsVisible(false), 3000);
            return () => clearTimeout(t);
        }
    }, [isConfirming, isConfirmed, error]);

    if (!isVisible || !hash) {
        return null;
    }

    const StatusIcon = () => {
        switch (status) {
            case 'pending':
                return <Icon as={HourglassIcon} tone={Tones.Amber} glow="soft" className="no-gap" />;
            case 'confirmed':
                return <Icon as={CheckIcon} tone={Tones.Emerald} glow="soft" className="no-gap" />;
            case 'error':
                return <Icon as={CloseIcon} tone={Tones.Magenta} glow="soft" className="no-gap" />;
            default:
                return <Icon as={HourglassIcon} tone={Tones.Amber} glow="soft" className="no-gap" />;
        }
    };

    const getStatusText = (): string => {
        switch (status) {
            case 'pending':
                return 'Transaction pending...';
            case 'confirming':
                return 'Confirming transaction...';
            case 'confirmed':
                return 'Transaction confirmed!';
            case 'error':
                return 'Transaction failed';
            default:
                return 'Processing...';
        }
    };

    const getStatusClass = () => {
        return `transaction-status ${status}`;
    };

    return (
        <div className={getStatusClass()}>
            <div className="content">
                <div className="icon">
                    {status === 'confirming' ? (
                        <div className="spinner"></div>
                    ) : (
                        <StatusIcon />
                    )}
                </div>
                <div className="text">
                    <div className="title">{getStatusText()}</div>
                    <div className="hash">
                        {hash.slice(0, 10)}...{hash.slice(-8)}
                    </div>
                </div>
                <button
                    className="close"
                    onClick={() => setIsVisible(false)}
                    disabled={status === 'confirming'}
                >
                    ×
                </button>
            </div>
        </div>
    );
};

export default TransactionStatus;
