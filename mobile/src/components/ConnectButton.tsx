import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useAppKit } from '@reown/appkit-react-native';
import { useAccount } from 'wagmi';
import { useAuth } from '@shared/core';
import { neon, neonGlow } from '../theme/neon';

/**
 * Pre-connect and post-connect wallet panel for `LandingScreen`.
 *
 * The compact variant is gone: inside the tab shell `AccountSheet` carries the
 * same actions, and this one only ever renders on the landing screen, which the
 * navigator unregisters once a wallet connects.
 */
export default function ConnectButton() {
    const { open, disconnect } = useAppKit();
    const { address, isConnected, chainId } = useAccount();
    const {
        isAuthenticated,
        user,
        signAndLogin,
        logout,
        isSigning,
        isVerifying,
        isNonceLoading
    } = useAuth();

    if (!isConnected) {
        return (
            <TouchableOpacity style={styles.connectButton} onPress={() => open()}>
                <Text style={styles.connectButtonText}>Connect Wallet</Text>
            </TouchableOpacity>
        );
    }

    const isLoading = isSigning || isVerifying || isNonceLoading;

    return (
        <View style={styles.container}>
            <Text style={styles.text}>Connected to Chain: {chainId}</Text>
            <Text style={styles.address} numberOfLines={1} ellipsizeMode="middle">
                Address: {address}
            </Text>

            {isAuthenticated ? (
                <View style={styles.authSection}>
                    <View style={styles.authStatus}>
                        <View style={styles.authenticatedBadge} />
                        <Text style={styles.authText}>Authenticated</Text>
                    </View>
                    {user && (
                        <Text style={styles.userInfo}>
                            Last login: {new Date(user.lastLogin).toLocaleDateString()}
                        </Text>
                    )}
                    <TouchableOpacity
                        style={[styles.button, styles.secondaryButton]}
                        onPress={() => logout()}
                    >
                        <Text style={styles.secondaryButtonText}>Logout</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.button, styles.disconnectButton]}
                        onPress={() => disconnect()}
                    >
                        <Text style={styles.disconnectButtonText}>Disconnect Wallet</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <View style={styles.authSection}>
                    <View style={styles.authStatus}>
                        <View style={styles.unauthenticatedBadge} />
                        <Text style={styles.authText}>Not Authenticated</Text>
                    </View>
                    <TouchableOpacity
                        style={[styles.button, isLoading && styles.buttonDisabled]}
                        onPress={() => signAndLogin()}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="small" color={neon.bgDeep} style={styles.spinnerMargin} />
                                <Text style={styles.buttonText}>
                                    {isSigning ? 'Signing...' : isVerifying ? 'Verifying...' : 'Loading...'}
                                </Text>
                            </View>
                        ) : (
                            <Text style={styles.buttonText}>Sign & Login</Text>
                        )}
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.button, styles.secondaryButton]}
                        onPress={() => disconnect()}
                    >
                        <Text style={styles.secondaryButtonText}>Disconnect Wallet</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    connectButton: {
        paddingHorizontal: 22,
        paddingVertical: 14,
        backgroundColor: neon.bgCard,
        borderRadius: 14,
        minWidth: 160,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: neon.cyan,
        ...neonGlow(neon.cyan, 14, 0.5),
    },
    connectButtonText: {
        color: neon.cyan,
        fontSize: 15,
        fontWeight: '800',
        letterSpacing: 1,
    },
    container: {
        padding: 16,
        backgroundColor: neon.bgPanel,
        borderRadius: 14,
        margin: 16,
        borderWidth: 1,
        borderColor: neon.border,
        ...neonGlow(neon.purple, 8, 0.2),
    },
    text: {
        fontSize: 16,
        fontWeight: '800',
        marginBottom: 8,
        color: neon.text,
    },
    address: {
        fontSize: 13,
        color: neon.textMuted,
        marginBottom: 16,
        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    },
    authSection: {
        marginTop: 8,
    },
    authStatus: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    authenticatedBadge: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: neon.success,
        marginRight: 8,
        ...neonGlow(neon.success, 6, 0.8),
    },
    unauthenticatedBadge: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: neon.magenta,
        marginRight: 8,
        ...neonGlow(neon.magenta, 6, 0.6),
    },
    authText: {
        fontSize: 14,
        fontWeight: '700',
        color: neon.text,
    },
    userInfo: {
        fontSize: 12,
        color: neon.textMuted,
        marginBottom: 12,
    },
    button: {
        backgroundColor: neon.bgCard,
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 10,
        alignItems: 'center',
        marginTop: 8,
        borderWidth: 1,
        borderColor: neon.cyan,
        ...neonGlow(neon.cyan, 8, 0.35),
    },
    buttonDisabled: {
        opacity: 0.45,
    },
    buttonText: {
        color: neon.cyan,
        fontSize: 16,
        fontWeight: '800',
    },
    secondaryButton: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: neon.purple,
        ...neonGlow(neon.purple, 6, 0.15),
    },
    secondaryButtonText: {
        color: neon.purple,
        fontSize: 16,
        fontWeight: '700',
    },
    disconnectButton: {
        backgroundColor: neon.bgCard,
        borderWidth: 1,
        borderColor: neon.danger,
        marginTop: 8,
        ...neonGlow(neon.danger, 8, 0.3),
    },
    disconnectButtonText: {
        color: neon.danger,
        fontSize: 16,
        fontWeight: '800',
    },
    loadingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    spinnerMargin: {
        marginRight: 8,
    },
});
