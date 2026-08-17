import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@shared/core';

import ConnectButton from '../components/ConnectButton';
import { neon, neonGlow } from '../theme/neon';

/**
 * Pre-connect screen, outside the tab shell. A signed-in player whose wallet is
 * not connected also lands here: every screen behind the tabs reads chain state,
 * so a session alone is not enough to enter.
 */
export default function LandingScreen() {
    const { isAuthenticated } = useAuth();
    const insets = useSafeAreaInsets();

    return (
        <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[styles.scrollContent, { paddingTop: Math.max(insets.top, 24) }]}
            showsVerticalScrollIndicator={false}
        >
            <View style={styles.welcomeSection}>
                <Text style={styles.heroKicker}>ON-CHAIN COLLECTION</Text>
                <Text style={styles.heroTitle}>Do Not Stop</Text>
                <View style={styles.heroGlowLine} />
                <Text style={styles.welcomeText}>
                    {isAuthenticated
                        ? 'Welcome back. Connect a wallet to load your on-chain pets.'
                        : 'Connect your wallet to mint, battle, and breed — same universe as the web app, in your pocket.'}
                </Text>
                <View style={styles.features}>
                    <View style={[styles.feature, styles.featureCyan]}>
                        <Text style={styles.featureTitle}>Create pets</Text>
                        <Text style={styles.featureSub}>Mint unique companions on-chain.</Text>
                    </View>
                    <View style={[styles.feature, styles.featureMagenta]}>
                        <Text style={styles.featureTitle}>Battles</Text>
                        <Text style={styles.featureSub}>Prove strength in the arena.</Text>
                    </View>
                    <View style={[styles.feature, styles.featurePurple]}>
                        <Text style={styles.featureTitle}>Breeding</Text>
                        <Text style={styles.featureSub}>Combine traits for the next gen.</Text>
                    </View>
                </View>
                <View style={styles.connectButtonContainer}>
                    <ConnectButton />
                </View>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    scrollView: {
        flex: 1,
        backgroundColor: neon.bgDeep,
    },
    scrollContent: {
        paddingHorizontal: 16,
        paddingBottom: 32,
    },
    welcomeSection: {
        alignItems: 'center',
    },
    heroKicker: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 4,
        color: neon.magenta,
        marginBottom: 8,
        textShadowColor: neon.magenta,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 8,
    },
    heroTitle: {
        fontSize: 36,
        fontWeight: '900',
        color: neon.text,
        letterSpacing: 1,
        marginBottom: 4,
        textShadowColor: neon.cyan,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 16,
    },
    heroGlowLine: {
        width: 120,
        height: 3,
        backgroundColor: neon.cyan,
        marginBottom: 20,
        borderRadius: 2,
        opacity: 0.95,
        ...neonGlow(neon.cyan, 8, 0.75),
    },
    welcomeText: {
        fontSize: 16,
        color: neon.textMuted,
        textAlign: 'center',
        marginBottom: 28,
        maxWidth: 600,
        lineHeight: 24,
    },
    features: {
        width: '100%',
        maxWidth: 900,
    },
    feature: {
        backgroundColor: neon.bgCard,
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
    },
    featureCyan: {
        borderColor: 'rgba(0, 245, 255, 0.45)',
        ...neonGlow(neon.cyan, 12, 0.25),
    },
    featureMagenta: {
        borderColor: 'rgba(255, 45, 166, 0.45)',
        ...neonGlow(neon.magenta, 12, 0.25),
    },
    featurePurple: {
        borderColor: 'rgba(192, 132, 252, 0.45)',
        ...neonGlow(neon.purple, 12, 0.22),
    },
    featureTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: neon.text,
        letterSpacing: 0.5,
        marginBottom: 6,
    },
    featureSub: {
        fontSize: 14,
        color: neon.textDim,
        lineHeight: 20,
    },
    connectButtonContainer: {
        alignItems: 'center',
        marginTop: 8,
    },
});
