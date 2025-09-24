import React from 'react';

import { useAuth } from '../contexts/AuthContext';

import Dashboard from './Dashboard';
import AccountDropdown from './AccountDropdown';
import './Main.css';

const Main: React.FC = () => {
  const { isAuthenticated } = useAuth();

  return (
    <div className="main-container">
      <AccountDropdown />

      <div className="main-content">
        <h1>Web3 Authentication Demo</h1>
        <p>Connect your wallet → Sign a message → Get JWT token → Access protected routes</p>

        {isAuthenticated && (
          <Dashboard />
        )}
      </div>
    </div>
  );
};

export default Main;
