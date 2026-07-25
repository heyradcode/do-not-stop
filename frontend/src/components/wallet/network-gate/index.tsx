import React, { useState } from 'react';
import { useAccount, useSwitchChain } from 'wagmi';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { TARGET_CHAIN_ID, getChainConfig, isSupportedChain } from '@constants/chains/ethereum';
import { Tones } from '@constants/tones';
import { NeonButton } from '@components/ui';
import Icon, { WarningIcon } from '@components/ui/icon';
import styles from './index.module.css';

/** Dynamic's EVM wallets expose this; the SDK's union type doesn't narrow to it
 *  without importing the Ethereum connector package, so probe for it instead. */
interface SwitchableWallet {
    switchNetwork?: (chainId: number) => Promise<void>;
}

/** MetaMask's user-rejection code, per EIP-1193. */
const USER_REJECTED = 4001;

function describeSwitchFailure(err: unknown): string {
    const code = (err as { code?: number } | null)?.code;
    if (code === USER_REJECTED) {
        return 'You dismissed the request in your wallet. Try again to keep playing.';
    }
    const message = err instanceof Error ? err.message : String(err);
    return message || 'Could not switch networks. Change it manually in your wallet.';
}

/**
 * Blocks play on the wrong EVM network and offers a one-click fix.
 *
 * `switchChain` sends `wallet_switchEthereumChain`, and wagmi's injected
 * connector retries with `wallet_addEthereumChain` when the wallet has never
 * heard of the chain (MetaMask error 4902). So a player who has never added Base
 * Sepolia gets the add prompt from this same button.
 *
 * Renders nothing unless an EVM wallet is connected, so Solana-only players never
 * see it.
 */
const NetworkGate: React.FC = () => {
    const { isConnected, chainId } = useAccount();
    const { switchChainAsync } = useSwitchChain();
    const { primaryWallet } = useDynamicContext();
    const [isSwitching, setIsSwitching] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isConnected || isSupportedChain(chainId)) return null;

    const targetName = getChainConfig(TARGET_CHAIN_ID)?.name ?? `chain ${TARGET_CHAIN_ID}`;

    const handleSwitch = async () => {
        setIsSwitching(true);
        setError(null);
        try {
            await switchChainAsync({ chainId: TARGET_CHAIN_ID });
        } catch (wagmiError) {
            // The app connects through Dynamic, which bridges into wagmi
            // asynchronously; if that bridge isn't live yet wagmi has no connector
            // to act on, but Dynamic's own wallet handle still does.
            const wallet = primaryWallet as SwitchableWallet | null;
            if (typeof wallet?.switchNetwork === 'function') {
                try {
                    await wallet.switchNetwork(TARGET_CHAIN_ID);
                    return;
                } catch (dynamicError) {
                    setError(describeSwitchFailure(dynamicError));
                    return;
                }
            }
            setError(describeSwitchFailure(wagmiError));
        } finally {
            setIsSwitching(false);
        }
    };

    return (
        <div className={styles.gate} role="alert">
            <span className={styles.icon}>
                <Icon as={WarningIcon} tone={Tones.Amber} noGap />
            </span>
            <div className={styles.copy}>
                <span className={styles.title}>Crypto Pets runs on {targetName}</span>
                <span className={styles.detail}>
                    {error ?? `Your wallet is on a different network, so pets and battles can't load.`}
                </span>
            </div>
            <NeonButton
                className={styles.action}
                onClick={() => void handleSwitch()}
                disabled={isSwitching}
                tone={Tones.Amber}
                size="sm"
            >
                {isSwitching ? 'Check your wallet...' : `Switch to ${targetName}`}
            </NeonButton>
        </div>
    );
};

export default NetworkGate;
