import React, { useState, useEffect } from 'react';
import {
  // Mainnets
  mainnet,
  bsc,
  polygon,
  arbitrum,
  optimism,
  avalanche,
  base,
  fantom,
  celo,
  gnosis,
  // Testnets
  sepolia,
  bscTestnet,
  polygonMumbai,
  arbitrumSepolia,
  optimismSepolia,
  avalancheFuji,
  baseSepolia,
  fantomTestnet,
  celoAlfajores,
  gnosisChiado
} from 'viem/chains';
import { useAccount, useSwitchChain } from 'wagmi';
import Modal from 'react-modal';
import './NetworkSwitcher.css';

// Organized chains with testnets right after their mainnets
const CHAINS = [
  // Ethereum
  { chain: mainnet, name: 'Ethereum', symbol: 'ETH', isTestnet: false },
  { chain: sepolia, name: 'Sepolia', symbol: 'ETH', isTestnet: true },

  // BSC
  { chain: bsc, name: 'BSC', symbol: 'BNB', isTestnet: false },
  { chain: bscTestnet, name: 'BSC Testnet', symbol: 'tBNB', isTestnet: true },

  // Polygon
  { chain: polygon, name: 'Polygon', symbol: 'MATIC', isTestnet: false },
  { chain: polygonMumbai, name: 'Mumbai', symbol: 'MATIC', isTestnet: true },

  // Arbitrum
  { chain: arbitrum, name: 'Arbitrum', symbol: 'ETH', isTestnet: false },
  { chain: arbitrumSepolia, name: 'Arbitrum Sepolia', symbol: 'ETH', isTestnet: true },

  // Optimism
  { chain: optimism, name: 'Optimism', symbol: 'ETH', isTestnet: false },
  { chain: optimismSepolia, name: 'Optimism Sepolia', symbol: 'ETH', isTestnet: true },

  // Avalanche
  { chain: avalanche, name: 'Avalanche', symbol: 'AVAX', isTestnet: false },
  { chain: avalancheFuji, name: 'Fuji', symbol: 'AVAX', isTestnet: true },

  // Base
  { chain: base, name: 'Base', symbol: 'ETH', isTestnet: false },
  { chain: baseSepolia, name: 'Base Sepolia', symbol: 'ETH', isTestnet: true },

  // Fantom
  { chain: fantom, name: 'Fantom', symbol: 'FTM', isTestnet: false },
  { chain: fantomTestnet, name: 'Fantom Testnet', symbol: 'FTM', isTestnet: true },

  // Celo
  { chain: celo, name: 'Celo', symbol: 'CELO', isTestnet: false },
  { chain: celoAlfajores, name: 'Alfajores', symbol: 'CELO', isTestnet: true },

  // Gnosis
  { chain: gnosis, name: 'Gnosis', symbol: 'GNO', isTestnet: false },
  { chain: gnosisChiado, name: 'Chiado', symbol: 'GNO', isTestnet: true },
];

const NetworkSwitcher: React.FC = () => {
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

  const visibleChains = showTestnets
    ? CHAINS.filter(chain => chain.isTestnet)
    : CHAINS.filter(chain => !chain.isTestnet);

  const currentChainConfig = CHAINS.find(
    chainConfig => chainConfig.chain.id === chain.id
  );

  const handleTestnetToggle = (checked: boolean) => {
    setShowTestnets(checked);
  };

  const handleNetworkSelect = (chainId: number) => {
    switchChain({ chainId });
    setIsOpen(false);
  };

  return (
    <div className="network-switcher-compact">
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

export default NetworkSwitcher;
