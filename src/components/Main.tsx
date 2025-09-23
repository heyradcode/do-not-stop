import React from 'react';

import { useAuth } from '../contexts/AuthContext';

import ProtectedContent from './ProtectedContent';
import WalletConnection from './WalletConnection';
import './Main.css';

const Main: React.FC = () => {
  const { isAuthenticated } = useAuth();

  return (
    <div className="main-container">
      <h1>Web3 Authentication Demo</h1>
      <p>Connect your wallet → Sign a message → Get JWT token → Access protected routes</p>
      
      <WalletConnection />
      
      {isAuthenticated && (
        <ProtectedContent />
      )}
    </div>
  );
};

export default Main;
