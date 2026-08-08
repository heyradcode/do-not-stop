import React, { useState } from 'react';
import {
    getRarityColor,
    SLOT,
    useChainCapabilities,
    usePetEquipment,
    usePetList,
    useTransferPet,
} from '@shared/core';
import TransactionStatus from '@components/common/transaction-status';
import NeonButton from '@components/ui/neon-button';
import NeonModal from '@components/ui/neon-modal';
import { useNotifyError } from '@hooks/useNotifyError';
import { useTxErrorToast } from '@hooks/useTxErrorToast';
import styles from './index.module.css';

const SLOT_LABEL: Record<number, string> = {
    [SLOT.weapon]: 'Weapon',
    [SLOT.armor]: 'Armor',
    [SLOT.trinket]: 'Trinket',
};

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
    const { activeKind: chain, address: addrCaps, chainLabel, walletAddress } = useChainCapabilities();
    const { refetch } = usePetList();
    const notifyError = useNotifyError();

    // Equipped gear is escrowed in ItemCore and paid out to whoever owns the pet when it is
    // unequipped, so it travels with the pet. That is the right rule — the alternative
    // strands the item in a wallet that can no longer reach it — but it is invisible, and
    // this modal is the last point where it can still be undone.
    const { equipped, isSuccess: gearKnown } = usePetEquipment({ chain, petId: petId.toString() });

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

            {/* Three states, not two. An unanswered read returns an empty list exactly like a
                bare pet does, and the query is disabled until the caller is authenticated, so
                falling through to silence would drop the warning in precisely the cases where
                nobody can see what is about to leave. */}
            {gearKnown && equipped.length > 0 && (
                <div className={styles.gearNotice} role="status">
                    <strong>This pet is wearing gear</strong>
                    <p>
                        Equipped items are held by the pet, so they go to the recipient with it.
                        Unequip anything you want to keep before sending.
                    </p>
                    <ul>
                        {equipped.map(({ slot, item }) => (
                            <li
                                key={slot}
                                style={{ '--rarity': getRarityColor(item.rarity) } as React.CSSProperties}
                            >
                                <span className={styles.gearSlot}>{SLOT_LABEL[slot] ?? `Slot ${slot}`}</span>
                                <span className={styles.gearName}>{item.name}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {!gearKnown && (
                <p className={styles.gearUnknown} role="status">
                    Could not check this pet’s equipment. Anything it has equipped will go to the
                    recipient along with it.
                </p>
            )}

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

