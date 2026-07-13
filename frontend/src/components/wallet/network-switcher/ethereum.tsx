import React, { useState } from 'react';
import clsx from 'clsx';
import { useAccount, useSwitchChain } from 'wagmi';
import {
    CHAINS,
    getChainConfig,
    getMainnetChains,
    getTestnetChains,
} from '@constants/chains/ethereum';
import { Tones } from '@constants/tones';
import { NeonButton, NeonModal } from '@components/ui';
import Icon, { CheckIcon } from '@components/ui/icon';
import styles from './index.module.css';

interface EthereumNetworkSwitcherProps {
    className?: string;
}

const EthereumNetworkSwitcher: React.FC<EthereumNetworkSwitcherProps> = ({ className }) => {
    const { chain } = useAccount();
    const { switchChain, isPending, error: switchError } = useSwitchChain();
    const [isOpen, setIsOpen] = useState(false);
    const [showTestnets, setShowTestnets] = useState(() => {
        if (!chain) return false;
        return CHAINS.some((c) => c.chain.id === chain.id && c.isTestnet);
    });

    if (!chain) return null;

    const visibleChains = showTestnets ? getTestnetChains() : getMainnetChains();
    const currentChainConfig = getChainConfig(chain.id);

    const handleNetworkSelect = (chainId: number) => {
        switchChain({ chainId });
        setIsOpen(false);
    };

    return (
        <div className={clsx(styles.networkSwitcher, className)}>
            {switchError && <div className={styles.error}>Error: {switchError.message}</div>}

            <NeonButton
                className={styles.trigger}
                onClick={() => setIsOpen(true)}
                disabled={isPending}
                tone={Tones.Azure}
                size="sm"
            >
                {isPending ? 'Switching...' : currentChainConfig?.name || 'Unknown'} ▼
            </NeonButton>

            <NeonModal
                isOpen={isOpen}
                onRequestClose={() => setIsOpen(false)}
                title="Select Network"
                className={styles.networkNeonModal}
                contentClassName={styles.networkNeonModalContent}
                headerActions={
                    <label className={styles.testnetToggle}>
                        <input
                            type="checkbox"
                            checked={showTestnets}
                            onChange={(e) => setShowTestnets(e.target.checked)}
                            disabled={isPending}
                        />
                        <span>Testnets</span>
                    </label>
                }
            >
                <div className={styles.networkList}>
                    {visibleChains.map(({ chain: chainConfig, name, symbol, isTestnet }) => (
                        <NeonButton
                            key={chainConfig.id}
                            className={clsx(
                                styles.option,
                                chain.id === chainConfig.id && styles.active,
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
                            {chain.id === chainConfig.id && (
                                <span className={styles.optionCheck}>
                                    <Icon
                                        as={CheckIcon}
                                        tone={Tones.Emerald}
                                        glow="soft"
                                        noGap
                                    />
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
