import React, { useState } from 'react';
import {
    getRarityColor,
    isSolanaWalletAddress,
    sameAccount,
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

    // Pets and items are separate assets, and PetCore enforces it: a transfer reverts with
    // "Unequip items before transferring" while any slot is filled. So this is not advice,
    // it is the reason the send would fail, and it is worth saying before the wallet opens
    // rather than after a rejected transaction.
    const { equipped, isSuccess: gearKnown } = usePetEquipment({ chain, petId: petId.toString() });
    // Only when we actually know. An unanswered read must not disable the button, or a
    // backend outage would make every pet look untransferable; the chain decides then.
    const blockedByGear = gearKnown && equipped.length > 0;

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

    /**
     * A recipient nobody holds a key for.
     *
     * Base58 has no checksum, so a mistyped Solana address usually still parses as a pubkey
     * and passes `addrCaps.isValid` — and about half of all 32-byte values are off the
     * ed25519 curve, which makes this the sharpest cheap check on a typo there is.
     *
     * A warning rather than a refusal, deliberately. Off-curve means only a program can move
     * what is sent there, not that it is lost: a PDA can own a Core asset, and a treasury or
     * multisig is a legitimate destination. Blocking would also make Solana stricter than
     * EVM, which accepts any 20-byte hex without complaint.
     */
    const recipientIsOffCurve =
        chain === 'solana' &&
        recipientAddress.trim().length > 0 &&
        addrCaps.isValid(recipientAddress.trim()) &&
        !isSolanaWalletAddress(recipientAddress);

    const validateRecipient = (raw: string): string | null => {
        const trimmed = raw.trim();
        if (!trimmed) return 'Please enter a recipient address';
        if (!addrCaps.isValid(trimmed)) return `Please enter a valid ${chainLabel} address`;
        // `sameAccount`, not `toLowerCase()`. Base58 Solana pubkeys are case-sensitive, so
        // folding case can make two distinct keys compare equal and refuse a legitimate
        // recipient as the sender. EVM addresses still fold, which is what the helper is for.
        if (sameAccount(trimmed, walletAddress ?? '')) {
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
            {blockedByGear && (
                <div className={styles.gearNotice} role="status">
                    <strong>Unequip before sending</strong>
                    <p>
                        Pets and items are separate assets, so this send will be rejected while
                        the pet is wearing gear. Unequip these in the Equipment panel first —
                        they stay in your bag.
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
                    Could not check this pet’s equipment. If it is wearing any, the send will be
                    rejected until you unequip it.
                </p>
            )}

            {recipientIsOffCurve && (
                <p className={styles.gearUnknown} role="status">
                    That address is off the ed25519 curve, so no wallet holds its key — it is a
                    program address. Check it carefully: only a program built to move this pet
                    could send it on.
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
                    disabled={!recipientAddress || isPending || blockedByGear}
                >
                    {isPending ? 'Sending...' : 'Send Pet'}
                </NeonButton>
            </div>

            <TransactionStatus lifecycle={lifecycle} />
        </NeonModal>
    );
};

export default SendPetModal;

