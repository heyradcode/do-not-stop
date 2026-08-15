import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    AccessibilityInfo,
    ActivityIndicator,
    Animated,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppKit } from '@reown/appkit-react-native';
import { useAccount } from 'wagmi';
import { useAuth } from '@shared/core';

import NativeBalance from './NativeBalance';
import type { RootStackParamList } from '../navigation/routes';
import { neon, neonGlow } from '../theme/neon';

const truncate = (addr: string): string => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

/**
 * Whether the OS has been asked to cut animation down.
 *
 * The listener is not optional padding around the initial read: the setting can be turned on
 * while the app is running, and without it a player who does that keeps every animation here
 * until the next cold start. The initial read is a promise that never resolves when the
 * native module is absent, which leaves this `false` — the right default, since the OS not
 * answering is not a request for reduced motion.
 */
function useReduceMotion(): boolean {
    const [reduced, setReduced] = useState(false);

    useEffect(() => {
        let alive = true;
        AccessibilityInfo.isReduceMotionEnabled().then((value) => {
            if (alive) {
                setReduced(value);
            }
        });
        const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
        return () => {
            alive = false;
            subscription.remove();
        };
    }, []);

    return reduced;
}

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
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const { isAuthenticated, signAndLogin, logout, isSigning, isVerifying, isNonceLoading } =
        useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const reduceMotion = useReduceMotion();

    /**
     * `isOpen` mounts the Modal; `entry` drives what is inside it, 0 to 1.
     *
     * They are separate because a close has to outlive the state change: the panel is still
     * animating out at the moment `isOpen` would already be false, so `isOpen` stays true
     * until the animation calls back.
     *
     * The Modal is `animationType="none"` for the same reason the panel is animated here at
     * all. RN's own fade applies to the whole window, backdrop included, so the panel could
     * only ever cross-fade in flat; driving it here lets it drop out of the header instead.
     */
    const entry = useRef(new Animated.Value(0)).current;
    /** Trigger press feedback. Kept apart from `entry` so a press never touches the sheet. */
    const pressScale = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (!isOpen) {
            return;
        }
        if (reduceMotion) {
            entry.setValue(1);
            return;
        }
        // Reset rather than trusting the close to have finished: an unmount mid-close leaves
        // the value part-way, and the sheet would then open from wherever it stopped.
        entry.setValue(0);
        Animated.spring(entry, {
            toValue: 1,
            useNativeDriver: true,
            stiffness: 260,
            damping: 22,
            mass: 0.7,
        }).start();
    }, [isOpen, reduceMotion, entry]);

    const close = useCallback(() => {
        if (reduceMotion) {
            setIsOpen(false);
            return;
        }
        Animated.timing(entry, {
            toValue: 0,
            duration: 120,
            useNativeDriver: true,
        }).start(() => setIsOpen(false));
    }, [reduceMotion, entry]);

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

    /**
     * Push a screen, then close the sheet — in that order.
     *
     * Closing first looked like a flicker of the Gallery: the sheet fades out, revealing
     * whatever is behind it, and the navigation push only starts animating underneath at the
     * same moment. The screen you came from is what shows through the gap.
     *
     * Navigating first puts the destination behind the sheet before the fade begins, so the
     * fade reveals where you are going rather than where you were. The Modal is its own
     * native window above the navigator, so the push is invisible until then.
     *
     * The fade is this file's own 120ms now rather than RN's ~300ms, which shortens the gap
     * without closing it, so the ordering still matters.
     */
    const go = (route: keyof RootStackParamList) => {
        navigation.navigate(route as never);
        close();
    };

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

    // Both read off `entry`, so the panel's lift, scale and fade cannot drift apart.
    const sheetLift = entry.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] });
    const sheetScale = entry.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] });

    return (
        <View style={styles.wrap}>
            <Animated.View style={{ transform: [{ scale: pressScale }] }}>
                <TouchableOpacity
                    style={styles.trigger}
                    onPress={() => setIsOpen(true)}
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

            <Modal visible={isOpen} transparent animationType="none" onRequestClose={close}>
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
                    <Animated.View
                        style={[
                            styles.sheet,
                            { width: sheetWidth },
                            {
                                opacity: entry,
                                transform: [{ translateY: sheetLift }, { scale: sheetScale }],
                            },
                        ]}
                    >
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

                            {/*
                             * Marriage is here rather than on the pet card because it is
                             * not a per-pet action: the screen has its own tabs, picks
                             * both sides itself, and lists every marriage the wallet
                             * holds. It had no entry point at all until now — the screen
                             * was registered in the navigator and nothing navigated to it.
                             */}
                            {/*
                             * Defence consent is wallet-wide by default — `DefenseScreen`
                             * opens with "all my pets" ticked — so it belongs here beside
                             * the other account-level actions. It was reachable only by
                             * tapping one pet's Defend button, which asks the player to
                             * pick a pet in order to reach a screen whose default answer
                             * is "all of them", and hides the whole feature behind a label
                             * that does not match what it does. The per-pet action stays:
                             * arriving from a card narrows the grant to that pet.
                             */}
                            <TouchableOpacity
                                style={[styles.action, styles.secondary]}
                                accessibilityRole="button"
                                accessibilityLabel="Allow Challenges"
                                onPress={() => go('Defense')}
                            >
                                <Text style={styles.secondaryText}>Allow Challenges</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.action, styles.secondary]}
                                accessibilityRole="button"
                                accessibilityLabel="Marriage"
                                onPress={() => go('Marriage')}
                            >
                                <Text style={styles.secondaryText}>Marriage</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.action, styles.secondary]}
                                accessibilityRole="button"
                                accessibilityLabel="Leaderboard"
                                onPress={() => go('Leaderboard')}
                            >
                                <Text style={styles.secondaryText}>Leaderboard</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.action, styles.secondary]}
                                accessibilityRole="button"
                                accessibilityLabel="Messages"
                                onPress={() => go('Chat')}
                            >
                                <Text style={styles.secondaryText}>Messages</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.action, styles.secondary]}
                                accessibilityRole="button"
                                accessibilityLabel="Inventory"
                                onPress={() => go('Inventory')}
                            >
                                <Text style={styles.secondaryText}>Inventory</Text>
                            </TouchableOpacity>

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
