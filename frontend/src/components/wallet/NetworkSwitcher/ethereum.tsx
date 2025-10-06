import React, { useState, useEffect } from 'react';
import { useAccount, useSwitchChain } from 'wagmi';
import Modal from 'react-modal';
import { CHAINS, getChainsByType, getChainConfig } from '../../../constants/chains/ethereum';
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

    // Set the app element for react-modal accessibility
    useEffect(() => {
        Modal.setAppElement('#root');
    }, []);

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
        <div className={`network-switcher-compact ${className || ''}`}>
            {switchError && (
                <div className="network-error-compact">
                    Error: {switchError.message}
                </div>
            )}

            <button
                className="network-trigger-compact"
                onClick={() => setIsOpen(true)}
                disabled={isPending}
            >
                <div className="network-info-compact">
                    <span className="network-name-compact">
                        {isPending ? 'Switching...' : (currentChainConfig?.name || 'Unknown')}
                    </span>
                </div>
                <div className="dropdown-arrow-compact">
                    ▼
                </div>
            </button>

            <Modal
                isOpen={isOpen}
                onRequestClose={() => setIsOpen(false)}
                className="network-modal"
                overlayClassName="network-modal-overlay"
                shouldCloseOnOverlayClick={true}
                shouldCloseOnEsc={true}
            >
                <div className="network-modal-header">
                    <h3>Select Network</h3>
                    <div className="network-modal-controls">
                        <label className="testnet-toggle">
                            <input
                                type="checkbox"
                                checked={showTestnets}
                                onChange={(e) => handleTestnetToggle(e.target.checked)}
                                disabled={isPending}
                            />
                            <span>Testnets</span>
                        </label>
                        <button
                            className="network-modal-close"
                            onClick={() => setIsOpen(false)}
                        >
                            ×
                        </button>
                    </div>
                </div>

                <div className="network-modal-content">
                    <div className="network-list">
                        {visibleChains.map(({ chain: chainConfig, name, symbol, isTestnet }) => (
                            <button
                                key={chainConfig.id}
                                className={`network-option ${chain.id === chainConfig.id ? 'active' : ''} ${isTestnet ? 'testnet' : ''}`}
                                onClick={() => handleNetworkSelect(chainConfig.id)}
                                disabled={isPending}
                            >
                                <div className="network-option-info">
                                    <span className="network-option-name">{name}</span>
                                    <span className="network-option-symbol">{symbol}</span>
                                </div>
                                {chain.id === chainConfig.id && (
                                    <div className="network-check">✓</div>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default EthereumNetworkSwitcher;
