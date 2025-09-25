import React, { useState, useEffect } from 'react';
import { useWaitForTransactionReceipt } from 'wagmi';
import './TransactionStatus.css';

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

    const getStatusIcon = () => {
        switch (status) {
            case 'pending':
                return '⏳';
            case 'confirming':
                return '🔄';
            case 'confirmed':
                return '✅';
            case 'error':
                return '❌';
            default:
                return '⏳';
        }
    };

    const getStatusText = () => {
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
            <div className="status-content">
                <div className="status-icon">
                    {status === 'confirming' ? (
                        <div className="spinner"></div>
                    ) : (
                        <span>{getStatusIcon()}</span>
                    )}
                </div>
                <div className="status-text">
                    <div className="status-title">{getStatusText()}</div>
                    <div className="transaction-hash">
                        {hash.slice(0, 10)}...{hash.slice(-8)}
                    </div>
                </div>
                <button
                    className="close-button"
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
