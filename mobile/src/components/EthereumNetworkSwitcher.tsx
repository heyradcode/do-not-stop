import React, { useState } from 'react';
import {
    Modal,
    View,
    Text,
    Pressable,
    StyleSheet,
    useWindowDimensions,
    Platform,
} from 'react-native';
import { useAccount, useSwitchChain } from 'wagmi';
import { CHAINS, getChainConfig } from '../constants/ethereumNetworks';
import { alpha, neon, neonGlow } from '../theme/neon';

/**
 * Mirrors the web `EthereumNetworkSwitcher`: compact trigger, “Select Network”
 * modal, chain rows with an active checkmark.
 *
 * Lists `CHAINS` — the chains with a deployment — so it can no longer put a
 * player somewhere `isSupportedChain` rejects. That also retires the testnet
 * toggle: every playable chain is a testnet, so switching it off emptied the
 * list.
 */
export default function EthereumNetworkSwitcher() {
    // Keyed off `chainId` (the raw connected id, defined even on networks the app
    // does not support) rather than `chain` (only set for configured chains).
    // Keying off `chain` hid this control exactly when a player needed it to get
    // back to a supported network — the same bug frontend fixed.
    const { chainId, isConnected } = useAccount();
    const { switchChain, isPending, error: switchError } = useSwitchChain();
    const [isOpen, setIsOpen] = useState(false);

    const { width } = useWindowDimensions();
    const modalWidth = Math.min(400, width - 40);

    if (!isConnected) {
        return null;
    }

    const currentMeta = chainId === undefined ? undefined : getChainConfig(chainId);

    const handleNetworkSelect = (targetChainId: number) => {
        switchChain({ chainId: targetChainId });
        setIsOpen(false);
    };

    return (
        <View style={styles.wrap}>
            {switchError ? (
                <View style={styles.errorBanner}>
                    <Text style={styles.errorText} numberOfLines={3}>
                        Error: {switchError.message}
                    </Text>
                </View>
            ) : null}

            <Pressable
                style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed, isPending && styles.triggerDisabled]}
                accessibilityRole="button"
                accessibilityLabel="Switch network"
                onPress={() => setIsOpen(true)}
                disabled={isPending}
            >
                <View style={styles.triggerInfo}>
                    <Text style={styles.triggerName} numberOfLines={1}>
                        {isPending ? 'Switching...' : currentMeta?.name ?? 'Wrong network'}
                    </Text>
                </View>
                <Text style={styles.triggerArrow}>▼</Text>
            </Pressable>

            <Modal
                visible={isOpen}
                transparent
                animationType="fade"
                onRequestClose={() => setIsOpen(false)}
            >
                <View style={styles.modalRoot}>
                    <Pressable
                        style={[StyleSheet.absoluteFillObject, styles.modalBackdrop]}
                        onPress={() => setIsOpen(false)}
                        accessibilityLabel="Close network modal"
                    />
                    <View style={[styles.modalCard, { width: modalWidth }]}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Select Network</Text>
                            <Pressable
                                style={styles.closeBtn}
                                onPress={() => setIsOpen(false)}
                                hitSlop={8}
                            >
                                <Text style={styles.closeBtnText}>×</Text>
                            </Pressable>
                        </View>

                        <View style={styles.modalBody}>
                            {CHAINS.map(({ chain: ch, name, symbol, isTestnet }) => {
                                const active = chainId === ch.id;
                                return (
                                    <Pressable
                                        key={ch.id}
                                        style={({ pressed }) => [
                                            styles.option,
                                            isTestnet ? styles.optionTestnet : null,
                                            active && styles.optionActive,
                                            active && isTestnet && styles.optionTestnetActive,
                                            pressed && styles.optionPressed,
                                        ]}
                                        onPress={() => handleNetworkSelect(ch.id)}
                                        disabled={isPending}
                                    >
                                        <View style={styles.optionInfo}>
                                            <Text
                                                style={[
                                                    styles.optionName,
                                                    active && styles.optionNameActive,
                                                    isTestnet && styles.optionNameTestnet,
                                                ]}
                                            >
                                                {name}
                                            </Text>
                                            <Text style={styles.optionSymbol}>{symbol}</Text>
                                        </View>
                                        {active ? <Text style={styles.check}>✓</Text> : null}
                                    </Pressable>
                                );
                            })}
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        position: 'relative',
        alignSelf: 'center',
        marginRight: 8,
    },
    errorBanner: {
        alignSelf: 'stretch',
        maxWidth: 280,
        marginBottom: 8,
        backgroundColor: 'rgba(255, 77, 109, 0.12)',
        borderWidth: 1,
        borderColor: 'rgba(255, 77, 109, 0.45)',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 6,
        ...neonGlow(neon.danger, 6, 0.25),
    },
    errorText: {
        fontSize: 11,
        color: neon.danger,
    },
    trigger: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minWidth: 120,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: neon.border,
        borderRadius: 12,
        backgroundColor: neon.bgCard,
        ...neonGlow(neon.cyan, 8, 0.25),
    },
    triggerPressed: {
        borderColor: neon.cyan,
        backgroundColor: neon.bgInput,
    },
    triggerDisabled: {
        opacity: 0.55,
        backgroundColor: neon.bgPanel,
    },
    triggerInfo: {
        flexShrink: 1,
    },
    triggerName: {
        fontSize: 14,
        fontWeight: '700',
        color: neon.text,
    },
    triggerArrow: {
        fontSize: 10,
        color: neon.cyan,
        marginLeft: 8,
    },
    modalRoot: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalBackdrop: {
        backgroundColor: 'rgba(5, 5, 13, 0.88)',
    },
    modalCard: {
        zIndex: 2,
        maxHeight: '80%',
        backgroundColor: neon.bgPanel,
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: neon.border,
        ...neonGlow(neon.purple, 14, 0.35),
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0, 245, 255, 0.2)',
        backgroundColor: neon.bgDeep,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: neon.text,
        flex: 1,
        letterSpacing: 0.3,
    },
    closeBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    closeBtnText: {
        fontSize: 24,
        color: neon.magenta,
        lineHeight: Platform.OS === 'ios' ? 28 : 24,
    },
    modalBody: {
        padding: 16,
        maxHeight: 360,
        backgroundColor: neon.bgDeep,
    },
    option: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 16,
        paddingHorizontal: 16,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: 'rgba(0, 245, 255, 0.2)',
        borderRadius: 12,
        backgroundColor: neon.bgCard,
    },
    optionTestnet: {
        borderColor: alpha(neon.warning, 0.55),
    },
    optionActive: {
        borderColor: neon.purple,
        backgroundColor: 'rgba(124, 58, 237, 0.2)',
        ...neonGlow(neon.purple, 10, 0.3),
    },
    optionTestnetActive: {
        backgroundColor: alpha(neon.warning, 0.12),
        borderColor: neon.warning,
    },
    optionPressed: {
        opacity: 0.9,
        transform: [{ translateY: -1 }],
    },
    optionInfo: {
        flex: 1,
    },
    optionName: {
        fontSize: 16,
        fontWeight: '600',
        color: neon.text,
    },
    optionNameActive: {
        color: neon.cyan,
    },
    optionNameTestnet: {
        color: neon.warningText,
    },
    optionSymbol: {
        fontSize: 14,
        color: neon.textMuted,
        fontWeight: '400',
        marginTop: 4,
    },
    check: {
        fontSize: 18,
        fontWeight: '800',
        color: neon.success,
        marginLeft: 8,
        textShadowColor: neon.success,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 6,
    },
});
