import React from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';

const WalletConnection: React.FC = () => {
  const { address, isConnected, chain, status } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  const handleConnect = () => {
    const injectedConnector = connectors.find(connector => connector.type === 'injected');
    if (injectedConnector) {
      connect({ connector: injectedConnector });
    }
  };

  if (!isConnected) {
    return (
      <div className="wallet-status">
        <p>No wallet connected</p>
        <button 
          onClick={handleConnect}
          disabled={isPending}
          className="connect-button"
        >
          {isPending ? 'Connecting...' : 'Connect Wallet'}
        </button>
      </div>
    );
  }

  return (
    <div className="wallet-status">
      <p className="status-item">✅ Connected: {isConnected ? 'true' : 'false'}</p>
      <p className="status-item">📍 Address: {address || 'Not connected'}</p>
      <p className="status-item">🌐 Network: {chain?.id || 'Unknown'}</p>
      <p className="status-item">📊 Status: {status}</p>
      <button 
        onClick={() => disconnect()}
        className="disconnect-button"
      >
        Disconnect
      </button>
    </div>
  );
};

export default WalletConnection;
