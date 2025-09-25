import React from 'react';

import { useAuth } from '../contexts/AuthContext';

import Dashboard from './Dashboard';
import AccountDropdown from './AccountDropdown';
import './Main.css';

const Main: React.FC = () => {
  const { isAuthenticated } = useAuth();

  return (
    <div className="main-container">
      <div className="main-header">
        <h1>Do Not Stop</h1>
      </div>

      <AccountDropdown />

      <div className="main-content">
        {isAuthenticated && (
          <Dashboard />
        )}
      </div>
    </div>
  );
};

export default Main;
