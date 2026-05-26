import React, { useState, useEffect } from 'react';
import { useWaitForTransactionReceipt } from 'wagmi';
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

    const { isLoading: isConfirming, isSuccess: isConfirmed, error } = useWaitForTransactionReceipt({
        hash: hash as `0x${string}`,
    });

    useEffect(() => {
        if (hash) {
            setIsVisible(true);
            setStatus('pending');
        }
    }, [hash]);

    useEffect(() => {
        if (isConfirming) {
            setStatus('confirming');
        } else if (isConfirmed) {
            setStatus('confirmed');
            setTimeout(() => {
                setIsVisible(false);
                onComplete?.();
            }, 2000);
        } else if (error) {
            setStatus('error');
            onError?.(error);
            setTimeout(() => {
                setIsVisible(false);
            }, 3000);
        }
    }, [isConfirming, isConfirmed, error, onComplete, onError]);

    if (!isVisible || !hash) {
        return null;
    }

    const StatusIcon = () => {
        switch (status) {
            case 'pending':
                return <Icon as={HourglassIcon} tone="amber" glow="soft" className="no-gap" />;
            case 'confirmed':
                return <Icon as={CheckIcon} tone="emerald" glow="soft" className="no-gap" />;
            case 'error':
                return <Icon as={CloseIcon} tone="magenta" glow="soft" className="no-gap" />;
            default:
                return <Icon as={HourglassIcon} tone="amber" glow="soft" className="no-gap" />;
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
