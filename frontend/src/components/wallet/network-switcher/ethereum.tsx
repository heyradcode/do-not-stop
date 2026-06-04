import React, { useState } from 'react';
import { useAccount, useSwitchChain } from 'wagmi';
import { CHAINS, getChainsByType, getChainConfig } from '@constants/chains/ethereum';
import { Tones } from '@constants/tones';
import { NeonButton, NeonModal } from '@components/ui';
import Icon, { CheckIcon } from '@components/ui/icon';
import './index.css';

interface EthereumNetworkSwitcherProps {
    className?: string;
}

const EthereumNetworkSwitcher: React.FC<EthereumNetworkSwitcherProps> = ({ className }) => {
    const { chain } = useAccount();
    const { switchChain, isPending, error: switchError } = useSwitchChain();
    const [isOpen, setIsOpen] = useState(false);
    const [showTestnets, setShowTestnets] = useState(() => {
        if (!chain) return false;
        return CHAINS.some(
            chainConfig => chainConfig.chain.id === chain.id && chainConfig.isTestnet
        );
    });

    if (!chain) return null;

    const visibleChains = getChainsByType(showTestnets);
    const currentChainConfig = getChainConfig(chain?.id || 0);

    const handleTestnetToggle = (checked: boolean) => {
        setShowTestnets(checked);
    };

    const handleNetworkSelect = (chainId: number) => {
        switchChain({ chainId });
        setIsOpen(false);
    };

    return (
        <div className={`network-switcher ${className || ''}`}>
            {switchError && (
                <div className="error">
                    Error: {switchError.message}
                </div>
            )}

            <NeonButton
                className="trigger"
                onClick={() => setIsOpen(true)}
                disabled={isPending}
                tone={Tones.Azure}
                size="sm"
            >
                {isPending ? 'Switching...' : (currentChainConfig?.name || 'Unknown')} ▼
            </NeonButton>

            <NeonModal
                isOpen={isOpen}
                onRequestClose={() => setIsOpen(false)}
                title="Select Network"
                className="network-neon-modal"
                contentClassName="network-neon-modal-content"
                headerActions={(
                    <label className="testnet-toggle">
                        <input
                            type="checkbox"
                            checked={showTestnets}
                            onChange={(e) => handleTestnetToggle(e.target.checked)}
                            disabled={isPending}
                        />
                        <span>Testnets</span>
                    </label>
                )}
            >
                <div className="network-list">
                    {visibleChains.map(({ chain: chainConfig, name, symbol, isTestnet }) => (
                        <NeonButton
                            key={chainConfig.id}
                            className={`option ${chain.id === chainConfig.id ? 'active' : ''} ${isTestnet ? 'testnet' : ''}`}
                            onClick={() => handleNetworkSelect(chainConfig.id)}
                            disabled={isPending}
                            tone={Tones.Azure}
                            size="sm"
                            fullWidth
                        >
                            <span className="option-info">
                                <span className="option-name">{name}</span>
                                <span className="option-symbol">{symbol}</span>
                            </span>
                            {chain.id === chainConfig.id && (
                                <span className="option-check">
                                    <Icon as={CheckIcon} tone={Tones.Emerald} glow="soft" className="no-gap" />
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
