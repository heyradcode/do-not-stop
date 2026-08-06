import React, { useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { useAppKit } from '@reown/appkit-react-native';
import { useAccount } from 'wagmi';
import { useAuth } from '@shared/core';

import NativeBalance from './NativeBalance';
import { neon, neonGlow } from '../theme/neon';

const truncate = (addr: string): string => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

/**
 * The account surface for the tab shell, mirroring frontend's `account-dropdown`.
 *
 * It exists for one thing AppKit's own modal cannot do: backend sign-in. Auth is
 * nonce → wallet signature → JWT, and every backend-served read (opponents,
 * taunts, battle rooms, the battle mutation) needs that token. Before this, the
 * header's only control opened AppKit's wallet modal, so a player who connected
 * went straight into the tab shell with no way to sign in — `ConnectButton`'s
 * auth actions only ever rendered on `LandingScreen`, which the navigator
 * unregisters the moment a wallet connects.
 *
 * Wallet-level concerns stay with AppKit rather than being reimplemented: the
 * Wallet button opens its modal.
 */
export default function AccountSheet() {
    const { open, disconnect } = useAppKit();
    const { address } = useAccount();
    const { isAuthenticated, signAndLogin, logout, isSigning, isVerifying, isNonceLoading } =
        useAuth();
    const [isOpen, setIsOpen] = useState(false);

    const { width } = useWindowDimensions();
    const sheetWidth = Math.min(400, width - 40);

    const isAuthPending = isNonceLoading || isSigning || isVerifying;
    const authLabel = isNonceLoading
        ? 'Getting nonce...'
        : isSigning
          ? 'Approve the signature in your wallet...'
          : isVerifying
            ? 'Verifying...'
            : 'Sign message & login';

    return (
        <View style={styles.wrap}>
            <TouchableOpacity
                style={styles.trigger}
                onPress={() => setIsOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Account"
                activeOpacity={0.85}
            >
                <Text style={styles.triggerText} numberOfLines={1}>
                    {address ? truncate(address) : 'Connected'}
                </Text>
                <Text style={styles.triggerArrow}>▼</Text>
            </TouchableOpacity>

            <Modal
                visible={isOpen}
                transparent
                animationType="fade"
                onRequestClose={() => setIsOpen(false)}
            >
                <View style={styles.modalRoot}>
                    <Pressable
                        style={[StyleSheet.absoluteFillObject, styles.backdrop]}
                        onPress={() => setIsOpen(false)}
                        accessibilityLabel="Close account sheet"
                    />
                    <View style={[styles.sheet, { width: sheetWidth }]}>
                        <View style={styles.header}>
                            <Text style={styles.title}>Account</Text>
                            <Pressable
                                style={styles.closeBtn}
                                onPress={() => setIsOpen(false)}
                                hitSlop={8}
                            >
                                <Text style={styles.closeBtnText}>×</Text>
                            </Pressable>
                        </View>

                        {address ? (
                            <>
                                <Text style={styles.label}>Address</Text>
                                {/*
                                 * `selectable` gives the native long-press copy.
                                 * RN core's `Clipboard` is deprecated and warns on
                                 * every call, and its replacement is a native
                                 * module — a rebuild and the pnpm/Metro install
                                 * trap for one button.
                                 */}
                                <Text style={styles.address} selectable>
                                    {address}
                                </Text>
                            </>
                        ) : null}

                        <Text style={styles.label}>Balance</Text>
                        <NativeBalance />

                        <View style={styles.actions}>
                            {isAuthenticated ? (
                                <TouchableOpacity
                                    style={styles.action}
                                    onPress={() => {
                                        logout();
                                        setIsOpen(false);
                                    }}
                                >
                                    <Text style={styles.actionText}>Logout</Text>
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity
                                    style={[styles.action, isAuthPending && styles.disabled]}
                                    onPress={() => signAndLogin()}
                                    disabled={isAuthPending}
                                >
                                    {isAuthPending ? (
                                        <View style={styles.actionInner}>
                                            <ActivityIndicator
                                                size="small"
                                                color={neon.cyan}
                                                style={styles.spinner}
                                            />
                                            <Text style={styles.actionText}>{authLabel}</Text>
                                        </View>
                                    ) : (
                                        <Text style={styles.actionText}>{authLabel}</Text>
                                    )}
                                </TouchableOpacity>
                            )}

                            <TouchableOpacity
                                style={[styles.action, styles.secondary]}
                                onPress={() => {
                                    setIsOpen(false);
                                    open();
                                }}
                            >
                                <Text style={styles.secondaryText}>Wallet</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.action, styles.danger]}
                                onPress={() => {
                                    setIsOpen(false);
                                    disconnect();
                                }}
                            >
                                <Text style={styles.dangerText}>Disconnect</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        alignSelf: 'center',
    },
    trigger: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: neon.bgCard,
        borderRadius: 12,
        minWidth: 120,
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: neon.magenta,
        ...neonGlow(neon.magenta, 10, 0.35),
    },
    triggerText: {
        color: neon.magenta,
        fontSize: 12,
        fontWeight: '700',
    },
    triggerArrow: {
        fontSize: 9,
        color: neon.magenta,
        marginLeft: 6,
    },
    modalRoot: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    backdrop: {
        backgroundColor: 'rgba(5, 5, 13, 0.88)',
    },
    sheet: {
        zIndex: 2,
        backgroundColor: neon.bgPanel,
        borderRadius: 16,
        padding: 20,
        borderWidth: 1,
        borderColor: neon.border,
        ...neonGlow(neon.purple, 14, 0.35),
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
    label: {
        fontSize: 11,
        fontWeight: '800',
        color: neon.textDim,
        letterSpacing: 1,
        textTransform: 'uppercase',
        marginTop: 12,
        marginBottom: 4,
    },
    address: {
        fontSize: 13,
        color: neon.textMuted,
        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    },
    actions: {
        marginTop: 20,
    },
    action: {
        backgroundColor: neon.bgCard,
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 8,
        borderWidth: 1,
        borderColor: neon.cyan,
        ...neonGlow(neon.cyan, 8, 0.35),
    },
    actionInner: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    spinner: {
        marginRight: 8,
    },
    actionText: {
        color: neon.cyan,
        fontSize: 15,
        fontWeight: '800',
    },
    secondary: {
        borderColor: neon.purple,
        ...neonGlow(neon.purple, 6, 0.15),
    },
    secondaryText: {
        color: neon.purple,
        fontSize: 15,
        fontWeight: '700',
    },
    danger: {
        borderColor: neon.danger,
        ...neonGlow(neon.danger, 8, 0.3),
    },
    dangerText: {
        color: neon.danger,
        fontSize: 15,
        fontWeight: '800',
    },
    disabled: {
        opacity: 0.55,
    },
});
