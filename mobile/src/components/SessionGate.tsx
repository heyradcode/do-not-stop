import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth, useChainCapabilities } from '@shared/core';

import { neon, neonGlow } from '../theme/neon';

type Props = {
    /** Screen heading, kept in every state so the screen does not lose its identity. */
    title: string;
    /** Shown when no wallet is connected. */
    connectPrompt: string;
    /** Shown when a wallet is connected but the session is not signed in. */
    signInPrompt: string;
    children: React.ReactNode;
};

/**
 * Gates a screen that cannot render without an authenticated session, and asks for
 * whichever step is actually missing.
 *
 * A connected wallet is not a session. Thirteen shared hooks — the leaderboard, the bag,
 * chat, opponents, equipment, defence consent — are disabled until `isAuthenticated`, so
 * without one they return empty and never even reach a loading state. Every screen built
 * on them then rendered its own empty copy: "No battles on record yet", "Nothing here
 * yet", "No conversations yet". All three are **wrong** when the truth is that nobody has
 * been asked yet, and none of them tells the player the one thing that would fix it.
 *
 * Signing in is one tap, so this offers the button rather than an explanation, matching
 * frontend's `SessionGate` and `AuthActionButton`.
 */
export default function SessionGate({ title, connectPrompt, signInPrompt, children }: Props) {
    const { isConnected } = useChainCapabilities();
    const { isAuthenticated, signAndLogin, isSigning, isVerifying, isNonceLoading } = useAuth();

    if (isConnected && isAuthenticated) return <>{children}</>;

    const busy = isNonceLoading || isSigning || isVerifying;
    const busyLabel = isNonceLoading
        ? 'Getting nonce…'
        : isSigning
          ? 'Check your wallet…'
          : 'Verifying…';

    return (
        <View style={styles.root}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.prompt}>{isConnected ? signInPrompt : connectPrompt}</Text>

            {/*
             * Only offered once a wallet is connected. Without one there is nothing to
             * sign with, and the button would fail in a way the player cannot act on —
             * the account sheet is where connecting happens.
             */}
            {isConnected ? (
                <TouchableOpacity
                    style={[styles.action, busy && styles.disabled]}
                    onPress={() => signAndLogin()}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel="Sign in to play"
                    activeOpacity={0.85}
                >
                    {busy ? (
                        <View style={styles.busyRow}>
                            <ActivityIndicator size="small" color={neon.cyan} style={styles.spinner} />
                            <Text style={styles.actionText}>{busyLabel}</Text>
                        </View>
                    ) : (
                        <Text style={styles.actionText}>Sign in to Play</Text>
                    )}
                </TouchableOpacity>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: neon.bgDeep,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    title: {
        fontSize: 22,
        fontWeight: '800',
        color: neon.text,
        letterSpacing: 0.5,
        textShadowColor: neon.cyan,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 10,
        marginBottom: 10,
    },
    prompt: {
        fontSize: 15,
        color: neon.textMuted,
        textAlign: 'center',
        lineHeight: 21,
    },
    action: {
        marginTop: 22,
        paddingHorizontal: 24,
        paddingVertical: 13,
        borderRadius: 12,
        backgroundColor: neon.bgCard,
        borderWidth: 1,
        borderColor: neon.cyan,
        ...neonGlow(neon.cyan, 10, 0.4),
    },
    busyRow: { flexDirection: 'row', alignItems: 'center' },
    spinner: { marginRight: 8 },
    actionText: { color: neon.cyan, fontSize: 16, fontWeight: '800' },
    disabled: { opacity: 0.55 },
});
