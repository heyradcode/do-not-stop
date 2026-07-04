import React, { useState } from 'react';
import clsx from 'clsx';
import { useWallet } from '@solana/wallet-adapter-react';
import { SOLANA_NETWORKS } from '@constants/chains/solana';
import { Tones } from '@constants/tones';
import { NeonModal } from '@components/ui';
import Icon, { CheckIcon } from '@components/ui/icon';
import s from './index.module.css';

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
        <div className={clsx(s.networkSwitcher, className)}>
            <button className={s.trigger} onClick={() => setIsOpen(true)}>
                <div className={s.info}>
                    <span className={s.name}>{currentNetworkConfig?.name || 'Select Network'}</span>
                </div>
                <div className={s.arrow}>▼</div>
            </button>

            <NeonModal
                isOpen={isOpen}
                onRequestClose={() => setIsOpen(false)}
                title="Select Solana Network"
                className={s.networkNeonModal}
                contentClassName={s.networkNeonModalContent}
            >
                <div className={s.networkList}>
                    {SOLANA_NETWORKS.map((network) => {
                        const isActive = currentNetwork === network.name;
                        return (
                            <button
                                key={network.name}
                                className={clsx(
                                    s.option,
                                    isActive && s.active,
                                    network.isTestnet && s.testnet,
                                )}
                                onClick={() => handleNetworkSelect(network.name)}
                            >
                                <div className={s.optionInfo}>
                                    <span className={s.optionName}>{network.name}</span>
                                </div>
                                {isActive && (
                                    <div className={s.optionCheck}>
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
