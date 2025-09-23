import React, { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import WalletConnection from './WalletConnection';
import ProtectedRoute from './ProtectedRoute';
import './AccountInfo.css';

const AccountInfo: React.FC = () => {
  const { address, isConnected, chain, status } = useAccount();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    console.log("Account status:", { address, isConnected, chain, status });
    
    // Check if user is authenticated
    const token = localStorage.getItem('authToken');
    setIsAuthenticated(!!token);
  }, [address, isConnected, chain, status]);

  return (
    <div className="wallet-container">
      <h1>Web3 Authentication Demo</h1>
      <p>Connect your wallet → Sign a message → Get JWT token → Access protected routes</p>
      
      <WalletConnection />
      
      {isAuthenticated && (
        <ProtectedRoute />
      )}
    </div>
  );
};

export default AccountInfo;
