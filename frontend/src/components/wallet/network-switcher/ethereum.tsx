import React, { useState } from 'react';
import clsx from 'clsx';
import { useAccount, useSwitchChain } from 'wagmi';
import { CHAINS, getChainConfig } from '@constants/chains/ethereum';
import { Tones } from '@constants/tones';
import { NeonButton, NeonModal } from '@components/ui';
import Icon, { CheckIcon } from '@components/ui/icon';
import styles from './index.module.css';

interface EthereumNetworkSwitcherProps {
    className?: string;
}

const EthereumNetworkSwitcher: React.FC<EthereumNetworkSwitcherProps> = ({ className }) => {
    // Keyed off `chainId` (the raw connected id, defined even on networks the app
    // doesn't support) rather than `chain` (only set for configured chains).
    // Keying off `chain` hid this control exactly when a player needed it to get
    // back to a supported network.
    const { chainId, isConnected } = useAccount();
    const { switchChain, isPending, error: switchError } = useSwitchChain();
    const [isOpen, setIsOpen] = useState(false);

    if (!isConnected) return null;

    const currentChainConfig = chainId === undefined ? undefined : getChainConfig(chainId);

    const handleNetworkSelect = (targetChainId: number) => {
        // wagmi's injected connector sends wallet_switchEthereumChain first, then
        // falls back to wallet_addEthereumChain when the wallet doesn't know the
        // chain (MetaMask error 4902) — one call both adds and switches.
        switchChain({ chainId: targetChainId });
        setIsOpen(false);
    };

    return (
        <div className={clsx(styles.networkSwitcher, className)}>
            {switchError && <div className={styles.error}>Error: {switchError.message}</div>}

            <NeonButton
                className={styles.trigger}
                onClick={() => setIsOpen(true)}
                disabled={isPending}
                tone={currentChainConfig ? Tones.Azure : Tones.Amber}
                size="sm"
            >
                {isPending ? 'Switching...' : currentChainConfig?.name ?? 'Wrong network'} ▼
            </NeonButton>

            <NeonModal
                isOpen={isOpen}
                onRequestClose={() => setIsOpen(false)}
                title="Select Network"
                className={styles.networkNeonModal}
                contentClassName={styles.networkNeonModalContent}
            >
                <div className={styles.networkList}>
                    {CHAINS.map(({ chain: chainConfig, name, symbol, isTestnet }) => (
                        <NeonButton
                            key={chainConfig.id}
                            className={clsx(
                                styles.option,
                                chainId === chainConfig.id && styles.active,
                                isTestnet && styles.testnet,
                            )}
                            onClick={() => handleNetworkSelect(chainConfig.id)}
                            disabled={isPending}
                            tone={Tones.Azure}
                            size="sm"
                            fullWidth
                        >
                            <span className={styles.optionInfo}>
                                <span className={styles.optionName}>{name}</span>
                                <span className="option-symbol">{symbol}</span>
                            </span>
                            {chainId === chainConfig.id && (
                                <span className={styles.optionCheck}>
                                    <Icon as={CheckIcon} tone={Tones.Emerald} glow="soft" noGap />
                                </span>
                            )}
                        </NeonButton>
                    ))}
                </div>
            </NeonModal>
        </div>
    );
};

export default EthereumNetworkSwitcher;
