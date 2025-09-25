import React from 'react';

import { useAuth } from '../contexts/AuthContext';

import AccountDropdown from './AccountDropdown';
import ZombieCreator from './ZombieCreator';
import ZombieGallery from './ZombieGallery';
import ZombieInteractions from './ZombieInteractions';
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
        {isAuthenticated ? (
          <>
            <ZombieCreator />
            <ZombieGallery />
            <ZombieInteractions />
          </>
        ) : (
          <div className="welcome-section">
            <h2>Welcome to Do Not Stop</h2>
            <p>Connect your wallet to start creating and managing your zombie collection!</p>
            <div className="features">
              <div className="feature">
                <h3>🧟‍♂️ Create Zombies</h3>
                <p>Generate unique zombies with random DNA and rarity</p>
              </div>
              <div className="feature">
                <h3>⚔️ Battle System</h3>
                <p>Pit your zombies against each other in epic battles</p>
              </div>
              <div className="feature">
                <h3>🧬 Breeding</h3>
                <p>Combine two zombies to create new offspring</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Main;
