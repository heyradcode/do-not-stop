import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import ScreenActionBar from './ScreenActionBar';
import { neon, neonGlow } from '../../theme/neon';

type Props = {
    title: string;
    subtitle: string;
    children: React.ReactNode;
    /** Success copy, cleared by the screen when a new attempt starts. */
    success: string | null;
    actionLabel: string;
    onAction: () => void;
    actionDisabled: boolean;
    /** Second, destructive-leaning action. Only Defense's Withdraw needs one. */
    secondary?: { label: string; onPress: () => void; disabled?: boolean };
    /** Error copy rendered inline, for screens whose hook surfaces one directly. */
    error?: string | null;
};

/**
 * Shared chrome for the single-mutation screens. Frontend gets this from its
 * `.interface` / `action-controls` CSS classes plus `TransactionStatus`; RN has no
 * cascade, so the structure has to be a component.
 *
 * The action row is pinned outside the `ScrollView`, not rendered after `children`.
 *
 * Inside the scroll its position tracked the height of whatever the screen put above it, so
 * the same button sat in a different place on every screen and, on the longer ones, below the
 * fold — a primary action you have to go looking for. Fixed, it is in the same place
 * everywhere, and reaching it never depends on how many pets a wallet happens to hold.
 *
 * The error and success lines moved with it, which is the less obvious half. Feedback about
 * an action belongs beside the control that caused it: `DefenseScreen` had already worked
 * around this with its own note next to the session button, because the layout's banner was
 * off-screen above by the time the player came back from the wallet.
 */
export default function ActionScreenLayout({
    title,
    subtitle,
    children,
    success,
    actionLabel,
    onAction,
    actionDisabled,
    secondary,
    error,
}: Props) {
    return (
        <View style={styles.root}>
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
            >
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.subtitle}>{subtitle}</Text>

                {children}
            </ScrollView>

            <ScreenActionBar>
                {error ? <Text style={styles.error}>{error}</Text> : null}

                {success ? (
                    <View style={styles.success}>
                        <Text style={styles.successText}>{success}</Text>
                    </View>
                ) : null}

                <TouchableOpacity
                    testID="action-primary"
                    style={[styles.action, actionDisabled && styles.actionDisabled]}
                    onPress={onAction}
                    disabled={actionDisabled}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                >
                    <Text style={styles.actionText}>{actionLabel}</Text>
                </TouchableOpacity>

                {secondary ? (
                    <TouchableOpacity
                        testID="action-secondary"
                        style={[styles.secondary, secondary.disabled && styles.actionDisabled]}
                        onPress={secondary.onPress}
                        disabled={secondary.disabled}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                    >
                        <Text style={styles.secondaryText}>{secondary.label}</Text>
                    </TouchableOpacity>
                ) : null}
            </ScreenActionBar>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: neon.bgDeep,
    },
    scroll: {
        flex: 1,
    },
    content: {
        padding: 16,
        paddingBottom: 24,
    },
    title: {
        fontSize: 22,
        fontWeight: '800',
        color: neon.text,
        letterSpacing: 0.5,
        textShadowColor: neon.cyan,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 10,
    },
    subtitle: {
        fontSize: 14,
        color: neon.textMuted,
        marginTop: 6,
        marginBottom: 20,
        lineHeight: 20,
    },
    // No `marginTop` on any of the four below: they are `ScreenActionBar` children, and its
    // `gap` already spaces them. Both would make the strip taller the more rows it shows.
    action: {
        backgroundColor: neon.bgCard,
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: neon.cyan,
        ...neonGlow(neon.cyan, 10, 0.4),
    },
    actionDisabled: {
        opacity: 0.5,
    },
    actionText: {
        color: neon.cyan,
        fontSize: 16,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    secondary: {
        backgroundColor: neon.bgPanel,
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: neon.borderMagenta,
    },
    secondaryText: {
        color: neon.magenta,
        fontSize: 15,
        fontWeight: '700',
    },
    error: {
        fontSize: 13,
        color: neon.danger,
    },
    success: {
        borderWidth: 1,
        borderColor: 'rgba(57, 255, 180, 0.45)',
        backgroundColor: neon.bgPanel,
        borderRadius: 12,
        padding: 14,
    },
    successText: {
        color: neon.success,
        fontSize: 14,
        fontWeight: '700',
    },
});
