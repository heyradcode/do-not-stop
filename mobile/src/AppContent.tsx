import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    StatusBar,
    StyleSheet,
    ScrollView,
    View,
    Text,
    TouchableOpacity,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppKit } from '@reown/appkit-react-native';
import { useAuth, useCreatePet, usePetList } from '@shared/core';
import { useAccount } from 'wagmi';
import ConnectButton from './components/ConnectButton';
import EthereumNetworkSwitcher from './components/EthereumNetworkSwitcher';
import CreatePetModal from './components/CreatePetModal';
import PetList from './components/PetList';
import { neon, neonGlow } from './theme/neon';

function AppRoot() {
    return (
        <SafeAreaProvider>
            <StatusBar barStyle="light-content" backgroundColor={neon.bgDeep} />
            <AppContent />
        </SafeAreaProvider>
    );
}

function AppContent() {
    const { isAuthenticated } = useAuth();
    const { isConnected } = useAccount();
    const pets = usePetList();
    const [refreshing, setRefreshing] = useState(false);
    const [createModalVisible, setCreateModalVisible] = useState(false);
    const insets = useSafeAreaInsets();

    const closeCreateModal = useCallback(() => {
        setCreateModalVisible(false);
    }, []);

    // EVM minting is two-phase (requestMintStarter, then settleMint once Pyth
    // Entropy reveals), so the list is only worth re-reading once onSuccess fires.
    const createPet = useCreatePet({
        onSuccess: () => {
            closeCreateModal();
            pets.refetch();
        },
    });

    const handleRefreshPets = useCallback(async () => {
        setRefreshing(true);
        try {
            await pets.refetch();
        } finally {
            setRefreshing(false);
        }
    }, [pets]);

    return (
        <View style={styles.mainContainer}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
                <Text style={styles.headerTitle}>Do Not Stop</Text>
                {(isAuthenticated || isConnected) && (
                    <View style={styles.walletSection}>
                        <View style={styles.walletRow}>
                            {isConnected ? <EthereumNetworkSwitcher /> : null}
                            <ConnectButton compact={true} />
                        </View>
                    </View>
                )}
            </View>

            {/* Main: avoid nesting ScrollView with PetList’s own scroll + pull-to-refresh */}
            {isAuthenticated || isConnected ? (
                isConnected ? (
                    <View style={styles.authenticatedMain}>
                        <Text style={styles.authenticatedText}>Welcome back!</Text>
                        <View style={styles.actionsRow}>
                            <TouchableOpacity
                                style={styles.createBtn}
                                onPress={() => setCreateModalVisible(true)}
                                activeOpacity={0.85}
                            >
                                <Text style={styles.createBtnText}>Create</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.refreshBtn, refreshing && styles.refreshBtnDisabled]}
                                onPress={handleRefreshPets}
                                disabled={refreshing}
                                activeOpacity={0.85}
                            >
                                {refreshing ? (
                                    <ActivityIndicator size="small" color={neon.cyan} />
                                ) : (
                                    <Text style={styles.refreshBtnText}>Refresh</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                        <CreatePetModal
                            visible={createModalVisible}
                            onClose={closeCreateModal}
                            createPet={createPet}
                        />
                        <PetList
                            pets={pets.pets}
                            isLoading={pets.isLoading}
                            error={pets.error}
                            onRefresh={handleRefreshPets}
                            refreshing={refreshing}
                        />
                    </View>
                ) : (
                    <ScrollView
                        style={styles.scrollView}
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                    >
                        <Text style={styles.authenticatedText}>Welcome back!</Text>
                        <Text style={styles.walletHint}>Connect a wallet to load your on-chain pets.</Text>
                    </ScrollView>
                )
            ) : (
                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.welcomeSection}>
                        <Text style={styles.heroKicker}>ON-CHAIN COLLECTION</Text>
                        <Text style={styles.heroTitle}>Do Not Stop</Text>
                        <View style={styles.heroGlowLine} />
                        <Text style={styles.welcomeText}>
                            Connect your wallet to mint, battle, and breed — same universe as the web app, in your
                            pocket.
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
            )}

            {/* AppKit UI component for wallet connection */}
            <AppKit />
        </View>
    );
}

const styles = StyleSheet.create({
    mainContainer: {
        flex: 1,
        backgroundColor: neon.bgDeep,
    },
    header: {
        backgroundColor: neon.bgPanel,
        borderBottomWidth: 1,
        borderBottomColor: neon.border,
        paddingHorizontal: 16,
        paddingBottom: 16,
        ...neonGlow(neon.cyan, 8, 0.2),
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: '800',
        textAlign: 'center',
        color: neon.text,
        letterSpacing: 2,
        textShadowColor: neon.cyan,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 12,
    },
    walletSection: {
        marginTop: 12,
        alignItems: 'center',
    },
    walletRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        flexWrap: 'wrap',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 16,
        paddingTop: 24,
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
    authenticatedMain: {
        flex: 1,
        paddingHorizontal: 16,
        paddingTop: 24,
        paddingBottom: 16,
        width: '100%',
    },
    walletHint: {
        marginTop: 16,
        fontSize: 16,
        color: neon.textMuted,
        textAlign: 'center',
    },
    authenticatedText: {
        fontSize: 24,
        fontWeight: '700',
        color: neon.text,
        textShadowColor: neon.purple,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 10,
    },
    actionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
        flexWrap: 'wrap',
    },
    createBtn: {
        backgroundColor: neon.bgCard,
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 12,
        marginRight: 12,
        marginBottom: 4,
        minWidth: 100,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: neon.cyan,
        ...neonGlow(neon.cyan, 10, 0.4),
    },
    createBtnText: {
        color: neon.cyan,
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    refreshBtn: {
        borderWidth: 1,
        borderColor: neon.magenta,
        backgroundColor: neon.bgPanel,
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 12,
        marginBottom: 4,
        minWidth: 100,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 42,
        ...neonGlow(neon.magenta, 8, 0.25),
    },
    refreshBtnDisabled: {
        opacity: 0.5,
    },
    refreshBtnText: {
        color: neon.magenta,
        fontSize: 16,
        fontWeight: '700',
    },
});

export default AppRoot;
