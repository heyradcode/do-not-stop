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

// Organized chains with testnets right after their mainnets
const organizedChains = [
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
  const { switchChain, isPending } = useSwitchChain();
  const [showTestnets, setShowTestnets] = useState(false);

  if (!chain) return null;

  const visibleChains = showTestnets
    ? organizedChains
    : organizedChains.filter(chain => !chain.isTestnet);

  return (
    <div className="network-switcher">
      <div className="network-header">
        <h4>Network</h4>
        <label className="testnet-toggle">
          <input
            type="checkbox"
            checked={showTestnets}
            onChange={(e) => setShowTestnets(e.target.checked)}
          />
          <span>Show Testnets</span>
        </label>
      </div>
      <div className="network-dropdown">
        <select
          value={chain.id}
          onChange={(e) => switchChain({ chainId: Number(e.target.value) })}
          disabled={isPending}
          className="network-select"
        >
          {visibleChains.map(({ chain: chainConfig, name, isTestnet }) => (
            <option
              key={chainConfig.id}
              value={chainConfig.id}
              className={isTestnet ? 'testnet-option' : ''}
            >
              {name} {isTestnet ? '(TEST)' : ''}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default NetworkSwitcher;
