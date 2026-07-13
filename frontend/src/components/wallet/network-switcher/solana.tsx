import React, { useState } from 'react';
import clsx from 'clsx';
import { useWallet } from '@solana/wallet-adapter-react';
import { SOLANA_NETWORKS } from '@constants/chains/solana';
import { Tones } from '@constants/tones';
import { NeonModal } from '@components/ui';
import Icon, { CheckIcon } from '@components/ui/icon';
import styles from './index.module.css';

interface SolanaNetworkSwitcherProps {
    className?: string;
}

const SolanaNetworkSwitcher: React.FC<SolanaNetworkSwitcherProps> = ({ className }) => {
    const { connected } = useWallet();
    const [isOpen, setIsOpen] = useState(false);
    const [currentNetwork, setCurrentNetwork] = useState('Solana Local');

    if (!connected) return null;

    const currentNetworkConfig = SOLANA_NETWORKS.find((n) => n.name === currentNetwork);

    const handleNetworkSelect = (networkName: string) => {
        setCurrentNetwork(networkName);
        setIsOpen(false);
    };

    return (
        <div className={clsx(styles.networkSwitcher, className)}>
            <button className={styles.trigger} onClick={() => setIsOpen(true)}>
                <div className={styles.info}>
                    <span className={styles.name}>{currentNetworkConfig?.name || 'Select Network'}</span>
                </div>
                <div className={styles.arrow}>▼</div>
            </button>

            <NeonModal
                isOpen={isOpen}
                onRequestClose={() => setIsOpen(false)}
                title="Select Solana Network"
                className={styles.networkNeonModal}
                contentClassName={styles.networkNeonModalContent}
            >
                <div className={styles.networkList}>
                    {SOLANA_NETWORKS.map((network) => {
                        const isActive = currentNetwork === network.name;
                        return (
                            <button
                                key={network.name}
                                className={clsx(
                                    styles.option,
                                    isActive && styles.active,
                                    network.isTestnet && styles.testnet,
                                )}
                                onClick={() => handleNetworkSelect(network.name)}
                            >
                                <div className={styles.optionInfo}>
                                    <span className={styles.optionName}>{network.name}</span>
                                </div>
                                {isActive && (
                                    <div className={styles.optionCheck}>
                                        <Icon
                                            as={CheckIcon}
                                            tone={Tones.Emerald}
                                            glow="soft"
                                            noGap
                                        />
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            </NeonModal>
        </div>
    );
};

export default SolanaNetworkSwitcher;
