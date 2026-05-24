import React, { useState } from 'react';
import {
    isValidEthAddress,
    isValidSolanaAddress,
    useActiveChain,
    usePetList,
    useTransferPet,
} from '@shared/core';
import TransactionStatus from '../../ui/transaction-status';
import './index.css';

interface SendPetModalProps {
    isOpen: boolean;
    onClose: () => void;
    pet: {
        name: string;
        dna: bigint;
        level: number;
        rarity: number;
    };
    petId: bigint;
}

const SendPetModal: React.FC<SendPetModalProps> = ({
    isOpen,
    onClose,
    pet,
    petId,
}) => {
    const chain = useActiveChain();
    const { refetch } = usePetList();
    const { mutate, isPending, error: hookError, hash, reset } = useTransferPet();

    const [recipientAddress, setRecipientAddress] = useState('');
    const [isConfirming, setIsConfirming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [txHash, setTxHash] = useState<string | undefined>(undefined);

    const addressPlaceholder = chain.kind === 'solana' ? 'Solana address (base58)' : '0x...';
    const addressLabel =
        chain.kind === 'solana' ? 'Recipient Solana Address:' : 'Recipient Ethereum Address:';

    const validateRecipient = (raw: string): string | null => {
        const trimmed = raw.trim();
        if (!trimmed) {
            return 'Please enter a recipient address';
        }

        if (chain.kind === 'solana') {
            if (!isValidSolanaAddress(trimmed)) {
                return 'Please enter a valid Solana address';
            }
            if (chain.address === trimmed) {
                return 'You cannot send a pet to yourself';
            }
            return null;
        }

        if (chain.kind === 'evm') {
            if (!isValidEthAddress(trimmed)) {
                return 'Please enter a valid Ethereum address';
            }
            if (trimmed.toLowerCase() === chain.address.toLowerCase()) {
                return 'You cannot send a pet to yourself';
            }
            return null;
        }

        return 'Please connect your wallet first';
    };

    const handleSend = async () => {
        setError(null);

        const validationError = validateRecipient(recipientAddress);
        if (validationError) {
            setError(validationError);
            return;
        }

        try {
            setIsConfirming(true);
            await mutate({ to: recipientAddress.trim(), petId: petId.toString() });
            if (chain.kind === 'solana') {
                await handleTransactionComplete();
            }
        } catch {
            setError('Failed to send pet. Please try again.');
            setIsConfirming(false);
        }
    };

    const handleClose = () => {
        if (!isConfirming && !isPending) {
            setRecipientAddress('');
            setError(null);
            setTxHash(undefined);
            reset();
            onClose();
        }
    };

    React.useEffect(() => {
        if (hash) {
            setTxHash(hash);
        }
    }, [hash]);

    React.useEffect(() => {
        if (hookError) {
            setError(hookError.message);
            setIsConfirming(false);
        }
    }, [hookError]);

    const handleTransactionComplete = async () => {
        await refetch();
        setRecipientAddress('');
        setIsConfirming(false);
        setError(null);
        setTxHash(undefined);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="send-pet-modal" onClick={handleClose}>
            <div className="dialog" onClick={(e) => e.stopPropagation()}>
                <div className="header">
                    <h2>Send Pet</h2>
                    <button
                        className="close"
                        onClick={handleClose}
                        disabled={isConfirming || isPending}
                    >
                        ×
                    </button>
                </div>

                <div className="body">
                    <div className="preview">
                        <h3>{pet.name}</h3>
                        <div className="details">
                            <p><strong>Level:</strong> {pet.level}</p>
                            <p><strong>DNA:</strong> {pet.dna.toString()}</p>
                            <p><strong>Rarity:</strong> {pet.rarity}</p>
                        </div>
                    </div>

                    <div className="recipient">
                        <label htmlFor="recipient">{addressLabel}</label>
                        <input
                            id="recipient"
                            type="text"
                            value={recipientAddress}
                            onChange={(e) => setRecipientAddress(e.target.value)}
                            placeholder={addressPlaceholder}
                            disabled={isConfirming || isPending}
                            className={error ? 'invalid' : ''}
                        />
                        {error && <p className="error-message">{error}</p>}
                    </div>

                    <div className="actions">
                        <button
                            className="cancel"
                            onClick={handleClose}
                            disabled={isConfirming || isPending}
                        >
                            Cancel
                        </button>
                        <button
                            className="send"
                            onClick={handleSend}
                            disabled={!recipientAddress || isConfirming || isPending}
                        >
                            {isConfirming || isPending ? 'Sending...' : 'Send Pet'}
                        </button>
                    </div>
                </div>

                {chain.kind === 'evm' && (
                    <TransactionStatus
                        hash={txHash}
                        onComplete={handleTransactionComplete}
                        onError={(err) => {
                            setError(err.message);
                            setIsConfirming(false);
                            setTxHash(undefined);
                        }}
                    />
                )}
            </div>
        </div>
    );
};

export default SendPetModal;
