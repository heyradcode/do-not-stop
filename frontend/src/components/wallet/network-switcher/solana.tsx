import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { SOLANA_NETWORKS } from '@constants/chains/solana';
import { Tones } from '@constants/tones';
import { NeonModal } from '@components/ui';
import Icon, { CheckIcon } from '@components/ui/icon';
import './index.css';

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
        <div className={`network-switcher ${className || ''}`}>
            <button className="trigger" onClick={() => setIsOpen(true)}>
                <div className="info">
                    <span className="name">{currentNetworkConfig?.name || 'Select Network'}</span>
                </div>
                <div className="arrow">▼</div>
            </button>

            <NeonModal
                isOpen={isOpen}
                onRequestClose={() => setIsOpen(false)}
                title="Select Solana Network"
                className="network-neon-modal"
                contentClassName="network-neon-modal-content"
            >
                <div className="network-list">
                    {SOLANA_NETWORKS.map((network) => {
                        const isActive = currentNetwork === network.name;
                        return (
                            <button
                                key={network.name}
                                className={`option ${isActive ? 'active' : ''} ${
                                    network.isTestnet ? 'testnet' : ''
                                }`}
                                onClick={() => handleNetworkSelect(network.name)}
                            >
                                <div className="option-info">
                                    <span className="option-name">{network.name}</span>
                                </div>
                                {isActive && (
                                    <div className="option-check">
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
