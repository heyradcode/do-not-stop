import React from 'react';
import { useAccount } from 'wagmi';

interface WalletStatusProps {
  isAuthenticated: boolean;
  user?: {
    address: string;
    lastLogin: string;
  } | null;
}

const WalletStatus: React.FC<WalletStatusProps> = ({ isAuthenticated, user }) => {
  const { address, isConnected, chain, status } = useAccount();

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
