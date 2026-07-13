import React, { useState } from 'react';
import { useChainCapabilities, usePetList, useTransferPet } from '@shared/core';
import TransactionStatus from '@components/common/transaction-status';
import NeonButton from '@components/ui/neon-button';
import NeonModal from '@components/ui/neon-modal';
import { useNotifyError } from '@hooks/useNotifyError';
import { useTxErrorToast } from '@hooks/useTxErrorToast';
import styles from './index.module.css';

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

    return (
        <NeonModal
            isOpen={isOpen}
            onRequestClose={handleClose}
            title="Send Pet"
            contentClassName={styles.sendPetBody}
        >
            <div className={styles.preview}>
                <h3>{pet.name}</h3>
                <div className={styles.details}>
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

            <div className={styles.recipient}>
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
                    className={inputInvalid ? styles.invalid : undefined}
                />
            </div>

            <div className={styles.actions}>
                <button className={styles.cancel} onClick={handleClose} disabled={isPending}>
                    Cancel
                </button>
                <NeonButton
                    tone="cyan"
                    onClick={handleSend}
                    disabled={!recipientAddress || isPending}
                >
                    {isPending ? 'Sending...' : 'Send Pet'}
                </NeonButton>
            </div>

            <TransactionStatus lifecycle={lifecycle} />
        </NeonModal>
    );
};

export default SendPetModal;

