import React from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { useAuth } from '../contexts/AuthContext';
import WalletStatus from './WalletStatus';
import './WalletConnection.css';

const WalletConnection: React.FC = () => {
  const { isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  
  // Auth context with centralized authentication logic
  const { 
    isAuthenticated, 
    user, 
    logout, 
    signAndLogin, 
    isSigning, 
    isVerifying, 
    isNonceLoading 
  } = useAuth();

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

  if (isAuthenticated && user) {
    return (
      <div>
        <WalletStatus />
        <div className="button-group">
          <button 
            onClick={logout}
            className="disconnect-button"
          >
            Logout
          </button>
          <button 
            onClick={() => disconnect()}
            className="disconnect-button"
          >
            Disconnect Wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <WalletStatus />
      <div className="button-group">
        <button 
          onClick={signAndLogin}
          disabled={isNonceLoading || isSigning || isVerifying}
          className="connect-button"
        >
          {isNonceLoading ? 'Getting nonce...' : isSigning ? 'Please sign in MetaMask...' : isVerifying ? 'Verifying...' : 'Sign Message & Login'}
        </button>
        <button 
          onClick={() => disconnect()}
          className="disconnect-button"
        >
          Disconnect
        </button>
      </div>
    </div>
  );
};

export default WalletConnection;
