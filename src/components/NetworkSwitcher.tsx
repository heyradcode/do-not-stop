import React from 'react';
import { useAccount, useSwitchChain } from 'wagmi';
import { mainnet, bsc, polygon, arbitrum, optimism } from 'viem/chains';
import './NetworkSwitcher.css';

const chains = [
  { chain: mainnet, name: 'Ethereum', symbol: 'ETH' },
  { chain: bsc, name: 'BSC', symbol: 'BNB' },
  { chain: polygon, name: 'Polygon', symbol: 'MATIC' },
  { chain: arbitrum, name: 'Arbitrum', symbol: 'ETH' },
  { chain: optimism, name: 'Optimism', symbol: 'ETH' },
];

const NetworkSwitcher: React.FC = () => {
  const { chain } = useAccount();
  const { switchChain, isPending } = useSwitchChain();

  if (!chain) return null;

  return (
    <div className="network-switcher">
      <h4>Network: {chain.name}</h4>
      <div className="network-buttons">
        {chains.map(({ chain: chainConfig, name, symbol }) => (
          <button
            key={chainConfig.id}
            onClick={() => switchChain({ chainId: chainConfig.id })}
            disabled={isPending || chain.id === chainConfig.id}
            className={`network-button ${chain.id === chainConfig.id ? 'active' : ''}`}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
};

export default NetworkSwitcher;
