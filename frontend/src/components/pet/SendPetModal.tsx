import React, { useState } from 'react';
import { usePetsContract } from '@shared/core';
import { petsContractParams } from '../../petsContractParams';
import TransactionStatus from '../ui/TransactionStatus';
import { isValidEthAddress } from '../../utils/isValidEthAddress';
import './SendPetModal.css';

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
    const [recipientAddress, setRecipientAddress] = useState('');
    const [isConfirming, setIsConfirming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [txHash, setTxHash] = useState<string | undefined>(undefined);
    const { transferPet, isPending, writeError, refetchPetIds, hash } = usePetsContract(petsContractParams);

    const handleSend = async () => {
        setError(null);

        if (!recipientAddress) {
            setError('Please enter a recipient address');
            return;
        }

        if (!isValidEthAddress(recipientAddress)) {
            setError('Please enter a valid Ethereum address');
            return;
        }

        if (recipientAddress.toLowerCase() === window.ethereum?.selectedAddress?.toLowerCase()) {
            setError('You cannot send a pet to yourself');
            return;
        }

        try {
            setIsConfirming(true);
            await transferPet(recipientAddress, petId);
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
            onClose();
        }
    };

    React.useEffect(() => {
        if (hash) {
            setTxHash(hash);
        }
    }, [hash]);

    const handleTransactionComplete = async () => {
        await refetchPetIds();
        setRecipientAddress('');
        setIsConfirming(false);
        setError(null);
        setTxHash(undefined);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={handleClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Send Pet</h2>
                    <button
                        className="close-button"
                        onClick={handleClose}
                        disabled={isConfirming || isPending}
                    >
                        ×
                    </button>
                </div>

                <div className="modal-body">
                    <div className="pet-preview">
                        <h3>{pet.name}</h3>
                        <div className="pet-details">
                            <p><strong>Level:</strong> {pet.level}</p>
                            <p><strong>DNA:</strong> {pet.dna.toString()}</p>
                            <p><strong>Rarity:</strong> {pet.rarity}</p>
                        </div>
                    </div>

                    <div className="recipient-input">
                        <label htmlFor="recipient">Recipient Address:</label>
                        <input
                            id="recipient"
                            type="text"
                            value={recipientAddress}
                            onChange={(e) => setRecipientAddress(e.target.value)}
                            placeholder="0x..."
                            disabled={isConfirming || isPending}
                            className={error ? 'error' : ''}
                        />
                        {error && <p className="error-message">{error}</p>}
                    </div>

                    {writeError && (
                        <div className="error-container">
                            <p>❌ Transaction failed: {writeError.message}</p>
                        </div>
                    )}

                    <div className="modal-actions">
                        <button
                            className="cancel-button"
                            onClick={handleClose}
                            disabled={isConfirming || isPending}
                        >
                            Cancel
                        </button>
                        <button
                            className="send-button"
                            onClick={handleSend}
                            disabled={!recipientAddress || isConfirming || isPending}
                        >
                            {isConfirming || isPending ? 'Sending...' : 'Send Pet'}
                        </button>
                    </div>
                </div>

                <TransactionStatus
                    hash={txHash}
                    onComplete={handleTransactionComplete}
                    onError={(err) => {
                        setError(err.message);
                        setIsConfirming(false);
                        setTxHash(undefined);
                    }}
                />
            </div>
        </div>
    );
};

export default SendPetModal;
