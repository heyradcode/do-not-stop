import React, { useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppKit } from '@reown/appkit-react-native';
import { useAccount } from 'wagmi';
import { useAuth } from '@shared/core';

import NativeBalance from './NativeBalance';
import { usePanelTransition } from '../hooks/usePanelTransition';
import { neon, neonGlow } from '../theme/neon';

const truncate = (addr: string): string => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

/** Stand-in slide distance for the one frame before the sheet has been measured. */
const CLOSED_FALLBACK = 800;

/**
 * The wallet surface for the tab shell, mirroring frontend's `account-dropdown`.
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
 *
 * Navigation is no longer here. This sheet used to carry five rows to Allow Challenges,
 * Marriage, Leaderboard, Messages and Inventory, which made the wallet control the only way
 * to reach half the app — the address you are connected with and where you want to go are
 * not the same question. They are `AppDrawer` now.
 */
export default function AccountSheet() {
    const { open, disconnect } = useAppKit();
    const { address } = useAccount();
    const { isAuthenticated, signAndLogin, logout, isSigning, isVerifying, isNonceLoading } =
        useAuth();
    const { isVisible, progress: entry, open: openSheet, close, reduceMotion } =
        usePanelTransition();

    /** Trigger press feedback. Kept apart from `entry` so a press never touches the sheet. */
    const pressScale = useRef(new Animated.Value(1)).current;

    const pressTrigger = (toValue: number) => {
        if (reduceMotion) {
            return;
        }
        Animated.spring(pressScale, {
            toValue,
            useNativeDriver: true,
            stiffness: 400,
            damping: 30,
            mass: 0.5,
        }).start();
    };

    const insets = useSafeAreaInsets();

    /**
     * How far down the sheet sits when closed, which is its own height: anchored to the bottom
     * edge, translating by that much puts it exactly off-screen.
     *
     * Measured rather than assumed, because the sheet's height depends on whether the player
     * is signed in and whether an auth stage is showing. The fallback covers the frame before
     * layout runs and is deliberately taller than the sheet can be, since starting too far
     * down is invisible and starting too little shows a band of it at rest.
     */
    const [sheetHeight, setSheetHeight] = useState(0);
    const onSheetLayout = (event: LayoutChangeEvent) =>
        setSheetHeight(event.nativeEvent.layout.height);

    const isAuthPending = isNonceLoading || isSigning || isVerifying;
    const authLabel = isNonceLoading
        ? 'Getting nonce...'
        : isSigning
          ? 'Approve the signature in your wallet...'
          : isVerifying
            ? 'Verifying...'
            : 'Sign message & login';

    const rise = entry.interpolate({
        inputRange: [0, 1],
        outputRange: [sheetHeight || CLOSED_FALLBACK, 0],
    });

    return (
        <View style={styles.wrap}>
            <Animated.View style={{ transform: [{ scale: pressScale }] }}>
                <TouchableOpacity
                    style={styles.trigger}
                    onPress={openSheet}
                    onPressIn={() => pressTrigger(0.96)}
                    onPressOut={() => pressTrigger(1)}
                    accessibilityRole="button"
                    accessibilityLabel="Account"
                    activeOpacity={0.85}
                >
                    <Text style={styles.triggerText} numberOfLines={1}>
                        {address ? truncate(address) : 'Connected'}
                    </Text>
                    <Text style={styles.triggerArrow}>▼</Text>
                </TouchableOpacity>
            </Animated.View>

            <Modal visible={isVisible} transparent animationType="none" onRequestClose={close}>
                <View style={styles.modalRoot}>
                    {/*
                     * The backdrop fades with the panel rather than being painted on at once:
                     * at 88% black, appearing instantly is the whole screen blinking out.
                     */}
                    <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: entry }]}>
                        <Pressable
                            style={[StyleSheet.absoluteFillObject, styles.backdrop]}
                            onPress={close}
                            accessibilityLabel="Close account sheet"
                        />
                    </Animated.View>
                    {/*
                     * No opacity on the panel. It is anchored to the bottom edge and slides by
                     * its own height, so it is already off-screen when closed; fading as well
                     * would only make a half-open sheet translucent, which a bottom sheet is
                     * not.
                     */}
                    <Animated.View
                        testID="account-sheet"
                        onLayout={onSheetLayout}
                        style={[
                            styles.sheet,
                            { paddingBottom: insets.bottom + 20 },
                            { transform: [{ translateY: rise }] },
                        ]}
                    >
                        {/* The grab handle is what says "this came up from the bottom edge and
                            goes back down there". */}
                        <View style={styles.grabber} />

                        <View style={styles.header}>
                            <Text style={styles.title}>Account</Text>
                            <Pressable style={styles.closeBtn} onPress={close} hitSlop={8}>
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
                                        close();
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
                                accessibilityRole="button"
                                accessibilityLabel="Wallet"
                                onPress={() => {
                                    close();
                                    open();
                                }}
                            >
                                <Text style={styles.secondaryText}>Wallet</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.action, styles.danger]}
                                accessibilityRole="button"
                                accessibilityLabel="Disconnect"
                                onPress={() => {
                                    close();
                                    disconnect();
                                }}
                            >
                                <Text style={styles.dangerText}>Disconnect</Text>
                            </TouchableOpacity>
                        </View>
                    </Animated.View>
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
        justifyContent: 'flex-end',
    },
    backdrop: {
        backgroundColor: 'rgba(5, 5, 13, 0.88)',
    },
    sheet: {
        zIndex: 2,
        backgroundColor: neon.bgPanel,
        // Top corners only: the bottom two are off the screen edge, and rounding them leaves
        // two slivers of scrim in the corners of the display.
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingHorizontal: 20,
        paddingTop: 12,
        borderTopWidth: 1,
        borderColor: neon.border,
        ...neonGlow(neon.purple, 14, 0.35),
    },
    grabber: {
        alignSelf: 'center',
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: neon.textDim,
        marginBottom: 12,
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
