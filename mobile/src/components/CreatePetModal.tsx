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
import { parseContractError, type CreatePetArgs, type PetMutationResult } from '@shared/core';
import { neon, neonGlow } from '../theme/neon';

/**
 * A wallet refusal and a prompt that never arrived report identically (code 4001), and
 * on a phone the second is common: MetaMask sitting on an update or onboarding screen
 * never renders the request, then denies it. So the wording covers both rather than
 * telling a player they cancelled something they were never shown.
 */
const REJECTED_HINT =
    'Cancelled in your wallet. If you never saw a prompt, open MetaMask, clear any update screen, and try again.';

type Props = {
    visible: boolean;
    onClose: () => void;
    createPet: PetMutationResult<CreatePetArgs>;
};

export default function CreatePetModal({ visible, onClose, createPet }: Props) {
    const { mutate, isPending, error, hash, isAwaitingFulfillment, isSettling, reset } = createPet;
    const [name, setName] = useState('');
    // Only the refusal case is rewritten. A revert reason or a gas failure is worth
    // showing verbatim, because it says something specific about why this mint failed;
    // a rejection dump says nothing the player can act on.
    const isUserRejection = error ? parseContractError(error).isUserRejection : false;
    const { width } = useWindowDimensions();
    const cardWidth = Math.min(400, width - 48);

    // Opening the sheet clears the previous attempt. Keyed on `visible` alone:
    // the adapter rebuilds its `lifecycle` object every render, so `reset` is a
    // new identity each time, and depending on it would re-run this effect on
    // every render, whose own `reset()` renders again. That loop is what
    // "Maximum update depth exceeded" was.
    useEffect(() => {
        if (visible) {
            setName('');
            reset();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- open-only reset
    }, [visible]);

    // EVM minting spans three waits: the request tx, Pyth Entropy revealing, then
    // the settle tx. All of them mean "keep the sheet locked and spinning".
    const busy = isPending || isAwaitingFulfillment === true || isSettling === true;
    const canSubmit = name.trim().length > 0 && !busy;

    const handleSubmit = () => {
        const trimmed = name.trim();
        if (!trimmed) {
            return;
        }
        // `mutate` captures its own errors into `error`, so it never rejects.
        mutate({ name: trimmed });
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={() => {
                if (!busy) {
                    onClose();
                }
            }}
        >
            <View style={styles.modalRoot}>
                <Pressable
                    style={[StyleSheet.absoluteFillObject, styles.backdrop]}
                    onPress={busy ? undefined : onClose}
                    accessibilityLabel="Close create pet modal"
                />
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={styles.sheetOuter}
                >
                    <View style={[styles.sheet, { width: cardWidth }]}>
                        <View style={styles.sheetHeader}>
                            <Text style={styles.sheetTitle}>Create a pet</Text>
                            <Pressable
                                onPress={busy ? undefined : onClose}
                                hitSlop={8}
                                style={styles.closeBtn}
                                disabled={busy}
                            >
                                <Text style={styles.closeBtnText}>×</Text>
                            </Pressable>
                        </View>
                        <Text style={styles.subtitle}>
                            Give your pet a name and mint it on-chain (same as the web app create flow).
                        </Text>
                        <TextInput
                            style={styles.input}
                            value={name}
                            onChangeText={setName}
                            placeholder="Pet name"
                            placeholderTextColor={neon.textDim}
                            maxLength={20}
                            editable={!busy}
                            autoCapitalize="words"
                            autoCorrect={false}
                        />
                        <TouchableOpacity
                            style={[styles.button, !canSubmit && styles.buttonDisabled]}
                            accessibilityRole="button"
                            accessibilityLabel="Create pet"
                            onPress={handleSubmit}
                            disabled={!canSubmit}
                        >
                            {busy ? (
                                <View style={styles.buttonInner}>
                                    <ActivityIndicator color={neon.cyan} size="small" style={styles.spinner} />
                                    <Text style={styles.buttonText}>
                                        {isPending
                                            ? 'Confirm in wallet…'
                                            : isAwaitingFulfillment
                                              ? 'Rolling traits…'
                                              : 'Minting…'}
                                    </Text>
                                </View>
                            ) : (
                                <Text style={styles.buttonText}>Create pet</Text>
                            )}
                        </TouchableOpacity>
                        {error ? (
                            <Text style={styles.error}>
                                {isUserRejection
                                    ? REJECTED_HINT
                                    : error instanceof Error
                                      ? error.message
                                      : String(error)}
                            </Text>
                        ) : null}
                        {hash && !error ? (
                            <Text style={styles.txHint} numberOfLines={1}>
                                {busy ? 'Transaction submitted…' : 'Done — refreshing list…'}
                            </Text>
                        ) : null}
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalRoot: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    backdrop: {
        backgroundColor: 'rgba(5, 5, 13, 0.88)',
    },
    sheetOuter: {
        zIndex: 2,
        width: '100%',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    sheet: {
        backgroundColor: neon.bgPanel,
        borderRadius: 16,
        padding: 20,
        maxWidth: 400,
        borderWidth: 1,
        borderColor: neon.border,
        ...neonGlow(neon.cyan, 16, 0.45),
    },
    sheetHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    sheetTitle: {
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
    input: {
        borderWidth: 1,
        borderColor: 'rgba(0, 245, 255, 0.35)',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 16,
        color: neon.text,
        backgroundColor: neon.bgInput,
        marginBottom: 12,
    },
    button: {
        backgroundColor: neon.bgCard,
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: neon.cyan,
        ...neonGlow(neon.cyan, 10, 0.4),
    },
    buttonDisabled: {
        opacity: 0.55,
    },
    buttonInner: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    spinner: {
        marginRight: 8,
    },
    buttonText: {
        color: neon.cyan,
        fontSize: 16,
        fontWeight: '800',
    },
    error: {
        marginTop: 10,
        fontSize: 13,
        color: neon.danger,
    },
    txHint: {
        marginTop: 8,
        fontSize: 12,
        color: neon.textMuted,
    },
});
