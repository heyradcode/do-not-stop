import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAccount, useSwitchChain } from 'wagmi';

import {
    TARGET_CHAIN_ID,
    getTargetChainName,
    isSupportedChain,
} from '../constants/ethereumNetworks';
import { useApprovedEvmChains } from '../hooks/useApprovedEvmChains';
import { useEvmSessionChain } from '../hooks/useEvmSessionChain';
import { neon, neonGlow } from '../theme/neon';

/** MetaMask's user-rejection code, per EIP-1193. */
const USER_REJECTED = 4001;

const AMBER = '#ff9800';
const AMBER_TEXT = '#ffb74d';

function describeSwitchFailure(
    err: unknown,
    targetName: string,
    targetAuthorized: boolean,
): string {
    const code = (err as { code?: number } | null)?.code;
    if (code === USER_REJECTED) {
        return 'You dismissed the request in your wallet. Try again to keep playing.';
    }
    if (!targetAuthorized) {
        return `Your wallet would not add ${targetName} to this session. Enable ${targetName} in the wallet, then disconnect and reconnect.`;
    }
    const message = err instanceof Error ? err.message : String(err);
    return message || 'Could not switch networks. Change it manually in your wallet.';
}

/**
 * Blocks play on the wrong EVM network and offers a one-click fix. Renders
 * nothing unless an EVM wallet is connected, so Solana-only players never see it.
 *
 * Wider than frontend's gate, because WalletConnect fails in a way the browser's
 * injected connector does not: the session freezes its approved chain set at
 * handshake, so a wallet can be "on" a chain it never authorized. That case shows
 * different copy, and `useEvmSessionChain` runs from here to repair it before the
 * player ever reaches a signature prompt.
 */
export default function NetworkGate() {
    const { isConnected, chainId } = useAccount();
    const { switchChainAsync } = useSwitchChain();
    const approvedChains = useApprovedEvmChains();
    const [isSwitching, setIsSwitching] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEvmSessionChain();

    // `null` means the approved set is unknown, so it cannot rule the target out.
    const targetAuthorized = approvedChains === null || approvedChains.includes(TARGET_CHAIN_ID);

    if (!isConnected || (isSupportedChain(chainId) && targetAuthorized)) return null;

    const targetName = getTargetChainName();

    const handleSwitch = async () => {
        setIsSwitching(true);
        setError(null);
        try {
            await switchChainAsync({ chainId: TARGET_CHAIN_ID });
        } catch (err) {
            setError(describeSwitchFailure(err, targetName, targetAuthorized));
        } finally {
            setIsSwitching(false);
        }
    };

    // An unapproved target still gets the switch button. The wallet fixed the
    // approved set at connect time, but `wallet_addEthereumChain` can extend a
    // live session, and that is the only path that does — reconnecting alone will
    // not help a wallet that hides testnets by default.
    return (
        <View style={styles.gate} accessibilityRole="alert">
            <Text style={styles.title}>
                {targetAuthorized
                    ? `CryptoPets runs on ${targetName}`
                    : `Wallet did not approve ${targetName}`}
            </Text>
            <Text style={styles.detail}>
                {error ??
                    (targetAuthorized
                        ? "Your wallet is on a different network, so pets and battles can't load."
                        : `This session has no permission for ${targetName}, so signing will fail. Switching asks your wallet to add it.`)}
            </Text>
            <TouchableOpacity
                style={[styles.btn, isSwitching && styles.disabled]}
                onPress={() => {
                    handleSwitch().catch(() => undefined);
                }}
                disabled={isSwitching}
                activeOpacity={0.85}
            >
                {isSwitching ? (
                    <ActivityIndicator color={AMBER_TEXT} size="small" />
                ) : (
                    <Text style={styles.btnText}>Switch to {targetName}</Text>
                )}
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    gate: {
        marginTop: 12,
        width: '100%',
        backgroundColor: 'rgba(255, 152, 0, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255, 152, 0, 0.55)',
        borderRadius: 12,
        padding: 12,
        ...neonGlow(AMBER, 8, 0.2),
    },
    title: {
        fontSize: 14,
        fontWeight: '800',
        color: AMBER_TEXT,
        marginBottom: 4,
    },
    detail: {
        fontSize: 13,
        color: neon.textMuted,
        lineHeight: 18,
        marginBottom: 10,
    },
    btn: {
        alignSelf: 'flex-start',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: AMBER,
        minWidth: 140,
        alignItems: 'center',
    },
    btnText: {
        color: AMBER_TEXT,
        fontWeight: '800',
        fontSize: 13,
    },
    disabled: {
        opacity: 0.55,
    },
});
