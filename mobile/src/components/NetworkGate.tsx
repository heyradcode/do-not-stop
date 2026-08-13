import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppKit } from '@reown/appkit-react-native';
import { useAccount, useSwitchChain } from 'wagmi';

import {
    TARGET_CHAIN_ID,
    getTargetChainName,
    isSupportedChain,
} from '../constants/ethereumNetworks';
import { useApprovedEvmChains } from '../hooks/useApprovedEvmChains';
import { useEvmChainSync } from '../hooks/useEvmChainSync';
import { useEvmSessionChain } from '../hooks/useEvmSessionChain';
import { useNotifyError } from '../hooks/useNotifyError';
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
    const message = err instanceof Error ? err.message : String(err);
    // Some wallets answer a request for a chain they never approved by ending the
    // session outright rather than refusing the call. Observed with Rabby, which
    // hides testnets by default and so has no Base Sepolia to add.
    if (/disconnect/i.test(message)) {
        return `Your wallet ended the session instead of adding ${targetName}. Enable ${targetName} in the wallet, then connect again.`;
    }
    if (!targetAuthorized) {
        return `Your wallet would not add ${targetName} to this session. Enable ${targetName} in the wallet, then disconnect and reconnect.`;
    }
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
    const { open, disconnect } = useAppKit();
    const approvedChains = useApprovedEvmChains();
    const notifyError = useNotifyError();
    const [isBusy, setIsBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEvmSessionChain();
    // Runs before the early return below, so it keeps working while the gate is hidden.
    // The desync it repairs is invisible to this gate: `chainId` reads as a supported
    // chain throughout, because that stale value is itself the bug.
    useEvmChainSync();

    // `null` means the approved set is unknown, so it cannot rule the target out.
    const targetAuthorized = approvedChains === null || approvedChains.includes(TARGET_CHAIN_ID);

    if (!isConnected || (isSupportedChain(chainId) && targetAuthorized)) return null;

    const targetName = getTargetChainName();

    const report = (err: unknown) => {
        const copy = describeSwitchFailure(err, targetName, targetAuthorized);
        setError(copy);
        // A wallet that ends the session takes this gate down with it: the tab
        // shell unmounts back to Landing, so the inline copy is gone before it can
        // be read. The toast outlives that.
        notifyError(copy, err, 'network-gate');
    };

    const handleSwitch = async () => {
        setIsBusy(true);
        setError(null);
        try {
            await switchChainAsync({ chainId: TARGET_CHAIN_ID });
        } catch (err) {
            report(err);
        } finally {
            setIsBusy(false);
        }
    };

    /**
     * Drops the session and opens the connect sheet, so the next handshake can
     * propose the target chain.
     *
     * This is the reliable path when the wallet never approved the target:
     * WalletConnect freezes a session's chain set at connect time, and only some
     * wallets honour `wallet_addEthereumChain` against a live session. The ones
     * that do not either refuse it or, worse, end the session.
     */
    const handleReconnect = async () => {
        setIsBusy(true);
        setError(null);
        try {
            await disconnect();
            await open();
        } catch (err) {
            report(err);
        } finally {
            setIsBusy(false);
        }
    };

    // Which action leads depends on why the gate is up. On the wrong chain with
    // the target approved, switching is a local provider call and always works.
    // With the target unapproved, only a fresh handshake reliably widens the set,
    // so reconnect leads and the add attempt stays available for the wallets that
    // do honour it.
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
                        : `This session has no permission for ${targetName}, so signing will fail. Your wallet fixes that list when it connects, so turn on ${targetName} there, then reconnect.`)}
            </Text>
            <TouchableOpacity
                style={[styles.btn, isBusy && styles.disabled]}
                onPress={() => {
                    (targetAuthorized ? handleSwitch() : handleReconnect()).catch(() => undefined);
                }}
                disabled={isBusy}
                activeOpacity={0.85}
            >
                {isBusy ? (
                    <ActivityIndicator color={AMBER_TEXT} size="small" />
                ) : (
                    <Text style={styles.btnText}>
                        {targetAuthorized ? `Switch to ${targetName}` : 'Reconnect wallet'}
                    </Text>
                )}
            </TouchableOpacity>
            {targetAuthorized ? null : (
                <TouchableOpacity
                    style={[styles.secondaryBtn, isBusy && styles.disabled]}
                    onPress={() => {
                        handleSwitch().catch(() => undefined);
                    }}
                    disabled={isBusy}
                    activeOpacity={0.85}
                >
                    <Text style={styles.secondaryBtnText}>
                        Ask this wallet to add {targetName}
                    </Text>
                </TouchableOpacity>
            )}
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
    secondaryBtn: {
        alignSelf: 'flex-start',
        paddingHorizontal: 4,
        paddingVertical: 8,
        marginTop: 4,
    },
    secondaryBtnText: {
        color: neon.textMuted,
        fontWeight: '700',
        fontSize: 12,
        textDecorationLine: 'underline',
    },
    disabled: {
        opacity: 0.55,
    },
});
