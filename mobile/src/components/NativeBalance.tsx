import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { formatEther } from 'viem';
import { useAccount, useBalance } from 'wagmi';

import { getNativeTokenSymbol } from '../constants/ethereumNetworks';
import { neon } from '../theme/neon';

/**
 * The connected wallet's native balance.
 *
 * EVM only. Frontend's takes a `type` prop and branches to a Solana
 * `connection.getBalance` poll; mobile's Solana wiring is its own workstream in
 * `docs/plan-mobile-frontend-parity.md`, and a prop with one valid value is
 * configurability nothing asked for. It grows the branch when Solana lands.
 */
export default function NativeBalance() {
    const { address, chainId } = useAccount();
    const { data, isLoading, error } = useBalance({ address });

    if (!address) return null;

    if (isLoading) {
        return <ActivityIndicator size="small" color={neon.cyan} />;
    }

    if (error) {
        // A wrong-network read fails here first, and NetworkGate already explains
        // why. Saying so plainly beats rendering a zero that looks like the truth.
        return <Text style={styles.muted}>Balance unavailable</Text>;
    }

    if (!data) return null;

    return (
        <View style={styles.row}>
            <Text style={styles.amount}>{parseFloat(formatEther(data.value)).toFixed(4)}</Text>
            <Text style={styles.symbol}>{getNativeTokenSymbol(chainId)}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },
    amount: {
        fontSize: 20,
        fontWeight: '800',
        color: neon.text,
    },
    symbol: {
        fontSize: 13,
        fontWeight: '700',
        color: neon.cyan,
        marginLeft: 6,
    },
    muted: {
        fontSize: 13,
        color: neon.textMuted,
    },
});
