import React, { useState } from 'react';
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
import './NetworkSwitcher.css';

const mainnetChains = [
  { chain: mainnet, name: 'Ethereum', symbol: 'ETH', isTestnet: false },
  { chain: bsc, name: 'BSC', symbol: 'BNB', isTestnet: false },
  { chain: polygon, name: 'Polygon', symbol: 'MATIC', isTestnet: false },
  { chain: arbitrum, name: 'Arbitrum', symbol: 'ETH', isTestnet: false },
  { chain: optimism, name: 'Optimism', symbol: 'ETH', isTestnet: false },
  { chain: avalanche, name: 'Avalanche', symbol: 'AVAX', isTestnet: false },
  { chain: base, name: 'Base', symbol: 'ETH', isTestnet: false },
  { chain: fantom, name: 'Fantom', symbol: 'FTM', isTestnet: false },
  { chain: celo, name: 'Celo', symbol: 'CELO', isTestnet: false },
  { chain: gnosis, name: 'Gnosis', symbol: 'GNO', isTestnet: false },
];

const testnetChains = [
  { chain: sepolia, name: 'Sepolia', symbol: 'ETH', isTestnet: true },
  { chain: bscTestnet, name: 'BSC Testnet', symbol: 'tBNB', isTestnet: true },
  { chain: polygonMumbai, name: 'Mumbai', symbol: 'MATIC', isTestnet: true },
  { chain: arbitrumSepolia, name: 'Arbitrum Sepolia', symbol: 'ETH', isTestnet: true },
  { chain: optimismSepolia, name: 'Optimism Sepolia', symbol: 'ETH', isTestnet: true },
  { chain: avalancheFuji, name: 'Fuji', symbol: 'AVAX', isTestnet: true },
  { chain: baseSepolia, name: 'Base Sepolia', symbol: 'ETH', isTestnet: true },
  { chain: fantomTestnet, name: 'Fantom Testnet', symbol: 'FTM', isTestnet: true },
  { chain: celoAlfajores, name: 'Alfajores', symbol: 'CELO', isTestnet: true },
  { chain: gnosisChiado, name: 'Chiado', symbol: 'GNO', isTestnet: true },
];

const NetworkSwitcher: React.FC = () => {
  const { chain } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  const [showTestnets, setShowTestnets] = useState(false);

  if (!chain) return null;

  const allChains = [...mainnetChains, ...testnetChains];
  const visibleChains = showTestnets ? allChains : mainnetChains;

  return (
    <div className="network-switcher">
      <div className="network-header">
        <h4>Network: {chain.name}</h4>
        <label className="testnet-toggle">
          <input
            type="checkbox"
            checked={showTestnets}
            onChange={(e) => setShowTestnets(e.target.checked)}
          />
          <span>Show Testnets</span>
        </label>
      </div>
      <div className="network-buttons">
        {visibleChains.map(({ chain: chainConfig, name, isTestnet }) => (
          <button
            key={chainConfig.id}
            onClick={() => switchChain({ chainId: chainConfig.id })}
            disabled={isPending || chain.id === chainConfig.id}
            className={`network-button ${chain.id === chainConfig.id ? 'active' : ''} ${isTestnet ? 'testnet' : ''}`}
          >
            {name}
            {isTestnet && <span className="testnet-badge">TEST</span>}
          </button>
        ))}
      </div>
    </div>
  );
};

export default NetworkSwitcher;
