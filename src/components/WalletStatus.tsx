import React from 'react';
import { useAccount } from 'wagmi';

const WalletStatus: React.FC = () => {
  const { address, isConnected, chain, status } = useAccount();

  if (!isConnected) {
    return (
      <div className="wallet-status">
        <p>No wallet connected</p>
      </div>
    );
  }

  return (
    <div className="wallet-status">
      <p className="status-item">✅ Connected: {isConnected ? 'true' : 'false'}</p>
      <p className="status-item">📍 Address: {address || 'Not connected'}</p>
      <p className="status-item">🌐 Network: {chain?.id || 'Unknown'}</p>
      <p className="status-item">📊 Status: {status}</p>
    </div>
  );
};

export default WalletStatus;
