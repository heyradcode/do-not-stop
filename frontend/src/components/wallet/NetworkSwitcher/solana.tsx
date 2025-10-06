import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import Modal from 'react-modal';
import { SOLANA_NETWORKS } from '../../../constants/chains/solana';
import './index.css';

interface SolanaNetworkSwitcherProps {
    className?: string;
}

const SolanaNetworkSwitcher: React.FC<SolanaNetworkSwitcherProps> = ({ className }) => {
    const { connected } = useWallet();
    const [isOpen, setIsOpen] = useState(false);
    const [currentNetwork, setCurrentNetwork] = useState('Solana Local');

    // Set the app element for react-modal accessibility
    useEffect(() => {
        Modal.setAppElement('#root');
    }, []);

    if (!connected) return null;

    const currentNetworkConfig = SOLANA_NETWORKS.find(n => n.name === currentNetwork);

    const handleNetworkSelect = (networkName: string) => {
        setCurrentNetwork(networkName);
        setIsOpen(false);
    };

    return (
        <div className={`network-switcher-compact ${className || ''}`}>
            <button
                className="network-trigger-compact"
                onClick={() => setIsOpen(true)}
            >
                <div className="network-info-compact">
                    <span className="network-name-compact">
                        {currentNetworkConfig?.name || 'Select Network'}
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
                    <h3>Select Solana Network</h3>
                    <div className="network-modal-controls">
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
                        {SOLANA_NETWORKS.map((network) => {
                            const isActive = currentNetwork === network.name;

                            return (
                                <button
                                    key={network.name}
                                    className={`network-option ${isActive ? 'active' : ''} ${network.isTestnet ? 'testnet' : ''}`}
                                    onClick={() => handleNetworkSelect(network.name)}
                                >
                                    <div className="network-option-info">
                                        <span className="network-option-name">{network.name}</span>
                                    </div>
                                    {isActive && (
                                        <div className="network-check">✓</div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default SolanaNetworkSwitcher;
