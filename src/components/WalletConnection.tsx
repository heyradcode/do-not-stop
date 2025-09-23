import React, { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useSignMessage } from 'wagmi';
import './WalletConnection.css';

const WalletConnection: React.FC = () => {
  const { address, isConnected, chain, status } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { signMessage, isPending: isSigning, data: signature, error: signError } = useSignMessage();
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pendingNonce, setPendingNonce] = useState<string | null>(null);

  // Handle signature completion
  useEffect(() => {
    if (signature && pendingNonce && address) {
      handleSignatureComplete(signature, pendingNonce, address);
    }
  }, [signature, pendingNonce, address]);

  // Handle signing errors
  useEffect(() => {
    if (signError) {
      console.error('Signing error:', signError);
      setLoading(false);
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
    
    setLoading(true);
    try {
      // Get nonce from backend
      const nonceResponse = await fetch('http://localhost:3001/api/auth/nonce');
      const { nonce } = await nonceResponse.json();
      
      // Store nonce for later use
      setPendingNonce(nonce);
      
      // Create message to sign
      const message = `Sign this message to authenticate: ${nonce}`;
      
      console.log('Requesting signature for message:', message);
      
      // Trigger the signing process - this will show MetaMask popup
      signMessage({ message });
      
    } catch (error) {
      console.error('Error getting nonce:', error);
      setLoading(false);
      alert('Error getting nonce: ' + error.message);
    }
  };

  const handleSignatureComplete = async (signature: string, nonce: string, address: string) => {
    try {
      console.log('Signature received, verifying with backend...');
      
      // Send to backend for verification
      const authResponse = await fetch('http://localhost:3001/api/auth/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          address,
          signature,
          nonce
        }),
      });
      
      const authData = await authResponse.json();
      
      if (authData.success) {
        // Store token in localStorage
        localStorage.setItem('authToken', authData.token);
        setUser(authData.user);
        setIsAuthenticated(true);
        console.log('Authentication successful:', authData);
      } else {
        console.error('Authentication failed:', authData.error);
        alert('Authentication failed: ' + authData.error);
      }
    } catch (error) {
      console.error('Verification error:', error);
      alert('Error during verification: ' + error.message);
    } finally {
      setLoading(false);
      setPendingNonce(null);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    setUser(null);
    setIsAuthenticated(false);
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
      <div className="wallet-status">
        <p className="status-item">✅ Connected: {isConnected ? 'true' : 'false'}</p>
        <p className="status-item">📍 Address: {address || 'Not connected'}</p>
        <p className="status-item">🌐 Network: {chain?.id || 'Unknown'}</p>
        <p className="status-item">📊 Status: {status}</p>
        <p className="status-item">🔐 Authenticated: Yes</p>
        <p className="status-item">👤 User: {user.address}</p>
        <p className="status-item">📅 Last Login: {new Date(user.lastLogin).toLocaleString()}</p>
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
    <div className="wallet-status">
      <p className="status-item">✅ Connected: {isConnected ? 'true' : 'false'}</p>
      <p className="status-item">📍 Address: {address || 'Not connected'}</p>
      <p className="status-item">🌐 Network: {chain?.id || 'Unknown'}</p>
      <p className="status-item">📊 Status: {status}</p>
      <p className="status-item">🔐 Authenticated: No</p>
      <div className="button-group">
        <button 
          onClick={handleSignAndLogin}
          disabled={loading || isSigning}
          className="connect-button"
        >
          {loading ? 'Processing...' : isSigning ? 'Please sign in MetaMask...' : 'Sign Message & Login'}
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
