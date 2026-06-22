import React, { useState } from 'react';
import { useChainCapabilities, usePetList, useTransferPet } from '@shared/core';
import TransactionStatus from '@components/common/transaction-status';
import { useNotifyError } from '@hooks/useNotifyError';
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

const SendPetModal: React.FC<SendPetModalProps> = ({ isOpen, onClose, pet, petId }) => {
    const { address: addrCaps, chainLabel, walletAddress } = useChainCapabilities();
    const { refetch } = usePetList();
    const notifyError = useNotifyError();

    const [recipientAddress, setRecipientAddress] = useState('');
    const [inputInvalid, setInputInvalid] = useState(false);

    // Settlement is lifecycle-driven (EVM: receipt confirmed; Solana: resolve).
    const handleTransferComplete = () => {
        refetch();
        setRecipientAddress('');
        setInputInvalid(false);
        onClose();
    };

    const {
        mutate,
        isPending,
        error: hookError,
        reset,
        lifecycle,
    } = useTransferPet({
        onSuccess: handleTransferComplete,
    });

    useTxErrorToast(hookError);

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
            await mutate({ to: recipientAddress.trim(), petId: petId.toString() });
        } catch (err) {
            console.error('[send-pet]', err);
        }
    };

    const handleClose = () => {
        if (!isPending) {
            setRecipientAddress('');
            setInputInvalid(false);
            reset();
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="send-pet-modal" onClick={handleClose}>
            <div className="dialog" onClick={(e) => e.stopPropagation()}>
                <div className="header">
                    <h2>Send Pet</h2>
                    <button className="close" onClick={handleClose} disabled={isPending}>
                        ×
                    </button>
                </div>

                <div className="body">
                    <div className="preview">
                        <h3>{pet.name}</h3>
                        <div className="details">
                            <p>
                                <strong>Level:</strong> {pet.level}
                            </p>
                            <p>
                                <strong>DNA:</strong> {pet.dna.toString()}
                            </p>
                            <p>
                                <strong>Rarity:</strong> {pet.rarity}
                            </p>
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
                            disabled={isPending}
                            className={inputInvalid ? 'invalid' : ''}
                        />
                    </div>

                    <div className="actions">
                        <button className="cancel" onClick={handleClose} disabled={isPending}>
                            Cancel
                        </button>
                        <button
                            className="send"
                            onClick={handleSend}
                            disabled={!recipientAddress || isPending}
                        >
                            {isPending ? 'Sending...' : 'Send Pet'}
                        </button>
                    </div>
                </div>

                <TransactionStatus lifecycle={lifecycle} />
            </div>
        </div>
    );
};

export default SendPetModal;
