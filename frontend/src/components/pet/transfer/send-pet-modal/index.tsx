import React, { useEffect, useState } from 'react';
import {
    useChainCapabilities,
    usePetList,
    useTransferPet,
} from '@shared/core';
import TransactionStatus from '@components/common/transaction-status';
import { useNotifyError, useNotifyReceiptError } from '@hooks/useNotifyError';
import { useTxErrorToast } from '@hooks/useTxErrorToast';
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
    const { address: addrCaps, chainLabel, walletAddress } = useChainCapabilities();
    const { refetch } = usePetList();
    const { mutate, isPending, error: hookError, hash, reset, lifecycle } = useTransferPet();
    const notifyError = useNotifyError();
    const notifyReceiptError = useNotifyReceiptError();

    useTxErrorToast(hookError);

    const [recipientAddress, setRecipientAddress] = useState('');
    const [isConfirming, setIsConfirming] = useState(false);
    const [inputInvalid, setInputInvalid] = useState(false);
    const [txHash, setTxHash] = useState<string | undefined>(undefined);

    const addressPlaceholder = addrCaps.placeholder;
    const addressLabel = addrCaps.label;

    const validateRecipient = (raw: string): string | null => {
        const trimmed = raw.trim();
        if (!trimmed) return 'Please enter a recipient address';
        if (!addrCaps.isValid(trimmed)) return `Please enter a valid ${chainLabel} address`;
        if (trimmed.toLowerCase() === (walletAddress ?? '').toLowerCase()) {
            return 'You cannot send a pet to yourself';
        }
        return null;
    };

    const handleSend = async () => {
        const validationMessage = validateRecipient(recipientAddress);
        if (validationMessage) {
            setInputInvalid(true);
            notifyError(validationMessage, undefined, 'send-pet-validation');
            return;
        }

        setInputInvalid(false);

        try {
            setIsConfirming(true);
            await mutate({ to: recipientAddress.trim(), petId: petId.toString() });
            if (lifecycle.phase === 'success') {
                await handleTransactionComplete();
            }
        } catch (err) {
            console.error('[send-pet]', err);
            setIsConfirming(false);
        }
    };

    const handleClose = () => {
        if (!isConfirming && !isPending) {
            setRecipientAddress('');
            setInputInvalid(false);
            setTxHash(undefined);
            reset();
            onClose();
        }
    };

    useEffect(() => {
        if (hash) {
            setTxHash(hash);
        }
    }, [hash]);

    const handleTransactionComplete = async () => {
        await refetch();
        setRecipientAddress('');
        setIsConfirming(false);
        setInputInvalid(false);
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
                            onChange={(e) => {
                                setRecipientAddress(e.target.value);
                                setInputInvalid(false);
                            }}
                            placeholder={addressPlaceholder}
                            disabled={isConfirming || isPending}
                            className={inputInvalid ? 'invalid' : ''}
                        />
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

                {lifecycle.phase === 'confirming' && (
                    <TransactionStatus
                        hash={txHash}
                        onComplete={handleTransactionComplete}
                        onError={(err) => {
                            notifyReceiptError(err);
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
