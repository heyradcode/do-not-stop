import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { useChainCapabilities, useTransferPet, type Pet } from '@shared/core';

import { validateTransferRecipient } from '../utils/validateTransferRecipient';
import { neon, neonGlow } from '../theme/neon';

type Props = {
    /** The pet being sent; null closes the sheet. */
    pet: Pet | null;
    onClose: () => void;
    /** Called after the transfer settles, so the caller can refresh its list. */
    onSent: () => void;
};

/**
 * Transfers one pet to another wallet, mirroring frontend's `send-pet-modal`.
 *
 * Chain-blind throughout: `useTransferPet` goes through the adapter, and the
 * address label, placeholder and validator all come from
 * `useChainCapabilities().address`, so this same sheet handles an EVM hex address
 * and a Solana base58 one without knowing which it has.
 *
 * Settlement is lifecycle-driven rather than inferred from the call returning: on
 * EVM that is the receipt confirming, on Solana the transaction resolving. Closing
 * on the promise alone would refresh the roster before the pet had moved.
 */
export default function SendPetModal({ pet, onClose, onSent }: Props) {
    const { address: addressCaps, chainLabel, walletAddress } = useChainCapabilities();
    const { width } = useWindowDimensions();
    const cardWidth = Math.min(400, width - 48);

    const [recipient, setRecipient] = useState('');
    const [validationError, setValidationError] = useState<string | null>(null);

    const { mutate, isPending, error, reset } = useTransferPet({
        onSuccess: () => {
            onSent();
            onClose();
        },
    });

    // A sheet reopened for a different pet must not show the previous attempt's
    // recipient or its error, which would read as applying to this pet.
    useEffect(() => {
        if (pet) {
            setRecipient('');
            setValidationError(null);
            reset();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- open-only reset
    }, [pet?.id]);

    const handleSend = () => {
        const message = validateTransferRecipient({
            raw: recipient,
            isValid: addressCaps.isValid,
            chainLabel,
            walletAddress,
        });
        if (message) {
            setValidationError(message);
            return;
        }
        setValidationError(null);
        // `mutate` captures its own failures into `error`; it never rejects.
        mutate({ to: recipient.trim(), petId: pet!.id });
    };

    const message = validationError ?? (error instanceof Error ? error.message : null);

    return (
        <Modal
            visible={pet !== null}
            transparent
            animationType="fade"
            onRequestClose={() => {
                if (!isPending) onClose();
            }}
        >
            <View style={styles.root}>
                <Pressable
                    style={[StyleSheet.absoluteFillObject, styles.backdrop]}
                    onPress={isPending ? undefined : onClose}
                    accessibilityLabel="Close send pet sheet"
                />
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={styles.outer}
                >
                    <View style={[styles.sheet, { width: cardWidth }]}>
                        <View style={styles.header}>
                            <Text style={styles.title}>Send {pet?.name ?? 'pet'}</Text>
                            <Pressable
                                onPress={isPending ? undefined : onClose}
                                hitSlop={8}
                                style={styles.closeBtn}
                                disabled={isPending}
                            >
                                <Text style={styles.closeBtnText}>×</Text>
                            </Pressable>
                        </View>
                        <Text style={styles.subtitle}>
                            This transfers ownership on chain. It cannot be undone from here.
                        </Text>

                        <Text style={styles.label}>{addressCaps.label}</Text>
                        <TextInput
                            style={styles.input}
                            value={recipient}
                            onChangeText={setRecipient}
                            placeholder={addressCaps.placeholder}
                            placeholderTextColor={neon.textDim}
                            editable={!isPending}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />

                        <TouchableOpacity
                            style={[styles.button, isPending && styles.disabled]}
                            onPress={handleSend}
                            disabled={isPending}
                        >
                            {isPending ? (
                                <View style={styles.buttonInner}>
                                    <ActivityIndicator
                                        color={neon.cyan}
                                        size="small"
                                        style={styles.spinner}
                                    />
                                    <Text style={styles.buttonText}>Confirm in wallet…</Text>
                                </View>
                            ) : (
                                <Text style={styles.buttonText}>Send pet</Text>
                            )}
                        </TouchableOpacity>

                        {message ? <Text style={styles.error}>{message}</Text> : null}
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    backdrop: {
        backgroundColor: 'rgba(5, 5, 13, 0.88)',
    },
    outer: {
        zIndex: 2,
        width: '100%',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    sheet: {
        backgroundColor: neon.bgPanel,
        borderRadius: 16,
        padding: 20,
        borderWidth: 1,
        borderColor: neon.border,
        ...neonGlow(neon.magenta, 16, 0.4),
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    title: {
        fontSize: 18,
        fontWeight: '800',
        color: neon.text,
        flex: 1,
        letterSpacing: 0.5,
    },
    closeBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    closeBtnText: {
        fontSize: 26,
        color: neon.magenta,
        lineHeight: Platform.OS === 'ios' ? 30 : 26,
    },
    subtitle: {
        fontSize: 14,
        color: neon.textMuted,
        marginBottom: 12,
        lineHeight: 20,
    },
    label: {
        fontSize: 11,
        fontWeight: '800',
        color: neon.textDim,
        letterSpacing: 1,
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    input: {
        borderWidth: 1,
        borderColor: 'rgba(255, 45, 166, 0.35)',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
        color: neon.text,
        backgroundColor: neon.bgInput,
        marginBottom: 12,
        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    },
    button: {
        backgroundColor: neon.bgCard,
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: neon.magenta,
        ...neonGlow(neon.magenta, 10, 0.4),
    },
    buttonInner: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    spinner: {
        marginRight: 8,
    },
    buttonText: {
        color: neon.magenta,
        fontSize: 16,
        fontWeight: '800',
    },
    disabled: {
        opacity: 0.55,
    },
    error: {
        marginTop: 10,
        fontSize: 13,
        color: neon.danger,
    },
});
