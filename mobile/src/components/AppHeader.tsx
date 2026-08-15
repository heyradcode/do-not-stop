import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccount } from 'wagmi';

import AccountSheet from './AccountSheet';
import AppDrawer from './AppDrawer';
import EthereumNetworkSwitcher from './EthereumNetworkSwitcher';
import NetworkGate from './NetworkGate';
import { neon, neonGlow } from '../theme/neon';

/**
 * Sits above the tab shell, carrying the wallet controls that frontend keeps in
 * its sidebar. Rendered once around the navigator rather than per screen, so it
 * does not remount on every tab change.
 *
 * `NetworkGate` lives here for that reason: it owns the session repair in
 * `useEvmSessionChain`, which must run once for the whole shell rather than
 * restarting on every tab change. It renders nothing while the network is fine.
 */
export default function AppHeader() {
    const { isConnected } = useAccount();
    const insets = useSafeAreaInsets();

    return (
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
            {/*
             * The spacer is the same width as the drawer's button, so the title stays
             * centred on the screen rather than on what is left of the row.
             */}
            <View style={styles.titleRow}>
                <AppDrawer />
                <Text style={styles.headerTitle}>Do Not Stop</Text>
                <View style={styles.titleSpacer} />
            </View>
            {isConnected ? (
                <View style={styles.walletRow}>
                    <EthereumNetworkSwitcher />
                    <AccountSheet />
                </View>
            ) : null}
            <NetworkGate />
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        backgroundColor: neon.bgPanel,
        borderBottomWidth: 1,
        borderBottomColor: neon.border,
        paddingHorizontal: 16,
        paddingBottom: 16,
        ...neonGlow(neon.cyan, 8, 0.2),
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    titleSpacer: {
        width: 40,
    },
    headerTitle: {
        flex: 1,
        fontSize: 28,
        fontWeight: '800',
        textAlign: 'center',
        color: neon.text,
        letterSpacing: 2,
        textShadowColor: neon.cyan,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 12,
    },
    walletRow: {
        marginTop: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        flexWrap: 'wrap',
    },
});
