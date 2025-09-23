import React, { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useSignMessage } from 'wagmi';
import { useNonce, useVerifySignature } from '../hooks/useAuth';
import { useAuth } from '../contexts/AuthContext';
import WalletStatus from './WalletStatus';
import './WalletConnection.css';

const WalletConnection: React.FC = () => {
  const { address, isConnected, chain, status } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { signMessage, isPending: isSigning, data: signature, error: signError } = useSignMessage();
  
  // React Query hooks
  const { data: nonceData, refetch: getNonce, isLoading: isNonceLoading } = useNonce();
  const { mutate: verifySignature, isPending: isVerifying, data: authData, error: verifyError } = useVerifySignature();
  
  // Auth context
  const { isAuthenticated, user, setAuthenticated, logout } = useAuth();
  const [pendingNonce, setPendingNonce] = useState<string | null>(null);

  // Handle signature completion
  useEffect(() => {
    if (signature && pendingNonce && address) {
      verifySignature({
        address,
        signature,
        nonce: pendingNonce,
      });
    }
  }, [signature, pendingNonce, address, verifySignature]);

  // Handle authentication success
  useEffect(() => {
    if (authData?.success) {
      setAuthenticated(true, authData.user);
      setPendingNonce(null);
      console.log('Authentication successful:', authData);
    }
  }, [authData, setAuthenticated]);

  // Handle verification errors
  useEffect(() => {
    if (verifyError) {
      console.error('Verification error:', verifyError);
      setPendingNonce(null);
      alert('Authentication failed: ' + verifyError.message);
    }
  }, [verifyError]);

  // Handle signing errors
  useEffect(() => {
    if (signError) {
      console.error('Signing error:', signError);
      setPendingNonce(null);
      alert('Signing failed: ' + signError.message);
    }
  }, [signError]);

  const handleConnect = () => {
    const injectedConnector = connectors.find(connector => connector.type === 'injected');
    if (injectedConnector) {
      connect({ connector: injectedConnector });
    }
  };

  const handleSignAndLogin = async () => {
    if (!address) return;
    
    try {
      // Get nonce from backend using React Query
      const { data } = await getNonce();
      const { nonce } = data;
      
      // Store nonce for later use
      setPendingNonce(nonce);
      
      // Create message to sign
      const message = `Sign this message to authenticate: ${nonce}`;
      
      console.log('Requesting signature for message:', message);
      
      // Trigger the signing process - this will show MetaMask popup
      signMessage({ message });
      
    } catch (error) {
      console.error('Error getting nonce:', error);
      alert('Error getting nonce: ' + error.message);
    }
  };

  const handleLogout = () => {
    logout();
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
            onClick={handleLogout}
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
          onClick={handleSignAndLogin}
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
