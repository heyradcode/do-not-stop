import React from 'react';
import {
    Animated,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { usePanelTransition } from '../hooks/usePanelTransition';
import { DRAWER_ITEMS, STACK_TITLES, type RootStackParamList } from '../navigation/routes';
import { neon, neonGlow } from '../theme/neon';

/**
 * The five account-level destinations, as a drawer rather than rows in the wallet sheet.
 *
 * They were already a group — the navigator had them as `FROM_ACCOUNT_SHEET` — so this moves
 * an existing group to a surface that is about going somewhere, and leaves `AccountSheet`
 * doing one thing. `Rename` and `Equip` stay out: both act on a pet you picked by tapping its
 * card, and a menu cannot ask which one.
 *
 * Built on `Animated` rather than `@react-navigation/drawer`. That package needs
 * `react-native-gesture-handler` and `react-native-reanimated`, both native modules on a bare
 * RN 0.82 app, so adopting it means a Gradle rebuild, a `pod install`, a babel plugin that
 * must be ordered last, and a reanimated release that actually targets 0.82 — this project
 * has hit the 0.82 ceiling before. What that buys is edge-swipe-to-open, which is also the
 * gesture most likely to fight the horizontal pagers in Gallery and Marriage. Five
 * destinations reached from a button do not need it.
 */
export default function AppDrawer() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const { isVisible, progress, open, close } = usePanelTransition();
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();

    // Never the full width: the strip of scrim left showing is what says the screen behind is
    // still there and a tap outside will bring it back.
    const panelWidth = Math.min(320, width * 0.82);

    /**
     * Push, then close — in that order.
     *
     * Closing first shows the screen you came from through the closing drawer, because the
     * push has not painted yet. Navigating first puts the destination behind the drawer
     * before it starts to leave, so what is revealed is where you are going. The Modal is its
     * own native window above the navigator, so the push is invisible until then.
     */
    const go = (route: keyof RootStackParamList) => {
        navigation.navigate(route as never);
        close();
    };

    const slide = progress.interpolate({ inputRange: [0, 1], outputRange: [-panelWidth, 0] });

    return (
        <>
            <TouchableOpacity
                testID="drawer-trigger"
                style={styles.trigger}
                onPress={open}
                accessibilityRole="button"
                accessibilityLabel="Menu"
                activeOpacity={0.85}
                hitSlop={8}
            >
                <Text style={styles.triggerGlyph}>☰</Text>
            </TouchableOpacity>

            <Modal visible={isVisible} transparent animationType="none" onRequestClose={close}>
                <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: progress }]}>
                    <Pressable
                        style={[StyleSheet.absoluteFillObject, styles.scrim]}
                        onPress={close}
                        accessibilityLabel="Close menu"
                    />
                </Animated.View>

                <Animated.View
                    style={[
                        styles.panel,
                        {
                            width: panelWidth,
                            paddingTop: insets.top + 16,
                            paddingBottom: insets.bottom + 16,
                            transform: [{ translateX: slide }],
                        },
                    ]}
                >
                    <View style={styles.header}>
                        <Text style={styles.title}>Menu</Text>
                        <Pressable style={styles.closeBtn} onPress={close} hitSlop={8}>
                            <Text style={styles.closeBtnText}>×</Text>
                        </Pressable>
                    </View>

                    {DRAWER_ITEMS.map((route) => (
                        <TouchableOpacity
                            key={route}
                            style={styles.row}
                            accessibilityRole="button"
                            accessibilityLabel={STACK_TITLES[route]}
                            onPress={() => go(route)}
                            activeOpacity={0.85}
                        >
                            <Text style={styles.rowText}>{STACK_TITLES[route]}</Text>
                        </TouchableOpacity>
                    ))}
                </Animated.View>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    trigger: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    triggerGlyph: {
        fontSize: 22,
        color: neon.cyan,
        textShadowColor: neon.cyan,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 8,
    },
    scrim: {
        backgroundColor: 'rgba(5, 5, 13, 0.88)',
    },
    panel: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        backgroundColor: neon.bgPanel,
        borderRightWidth: 1,
        borderRightColor: neon.border,
        paddingHorizontal: 16,
        ...neonGlow(neon.purple, 16, 0.35),
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    title: {
        flex: 1,
        fontSize: 18,
        fontWeight: '800',
        color: neon.text,
        letterSpacing: 0.3,
    },
    closeBtn: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    closeBtnText: {
        fontSize: 24,
        color: neon.magenta,
    },
    row: {
        backgroundColor: neon.bgCard,
        borderRadius: 12,
        paddingVertical: 14,
        paddingHorizontal: 14,
        marginTop: 8,
        borderWidth: 1,
        borderColor: neon.purple,
        ...neonGlow(neon.purple, 6, 0.15),
    },
    rowText: {
        color: neon.purple,
        fontSize: 15,
        fontWeight: '700',
    },
});
