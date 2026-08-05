import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

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
        <ScrollView style={styles.root} contentContainerStyle={styles.content}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>

            {children}

            <TouchableOpacity
                style={[styles.action, actionDisabled && styles.actionDisabled]}
                onPress={onAction}
                disabled={actionDisabled}
                activeOpacity={0.85}
            >
                <Text style={styles.actionText}>{actionLabel}</Text>
            </TouchableOpacity>

            {secondary ? (
                <TouchableOpacity
                    style={[styles.secondary, secondary.disabled && styles.actionDisabled]}
                    onPress={secondary.onPress}
                    disabled={secondary.disabled}
                    activeOpacity={0.85}
                >
                    <Text style={styles.secondaryText}>{secondary.label}</Text>
                </TouchableOpacity>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {success ? (
                <View style={styles.success}>
                    <Text style={styles.successText}>{success}</Text>
                </View>
            ) : null}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: neon.bgDeep,
    },
    content: {
        padding: 16,
        paddingBottom: 32,
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
    action: {
        backgroundColor: neon.bgCard,
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: neon.cyan,
        marginTop: 20,
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
        marginTop: 12,
    },
    secondaryText: {
        color: neon.magenta,
        fontSize: 15,
        fontWeight: '700',
    },
    error: {
        marginTop: 12,
        fontSize: 13,
        color: neon.danger,
    },
    success: {
        marginTop: 16,
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
