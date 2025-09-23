import React from 'react';
import { useAccount } from 'wagmi';

import { useAuth } from '../contexts/AuthContext';

const WalletStatus: React.FC = () => {
  const { address, isConnected, chain, status } = useAccount();
  const { isAuthenticated, user } = useAuth();

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
      <p className="status-item">🔐 Authenticated: {isAuthenticated ? 'Yes' : 'No'}</p>
      {isAuthenticated && user && (
        <>
          <p className="status-item">👤 User: {user.address}</p>
          <p className="status-item">📅 Last Login: {new Date(user.lastLogin).toLocaleString()}</p>
        </>
      )}
    </div>
  );
};

export default WalletStatus;
