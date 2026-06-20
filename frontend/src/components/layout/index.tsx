import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import AccountDropdown from '@components/wallet/account-dropdown';
import SolanaWalletTrigger from '@components/wallet/solana-wallet-trigger';
import PetGallery from '@components/pet/collection/pet-gallery';
import { isInteractionRoute } from '@constants/interactionRoutes';
import './index.css';

const TITLE = 'Crypto Pets';

const Layout: React.FC = () => {
  const location = useLocation();
  const isGalleryHidden = isInteractionRoute(location.pathname);

  return (
    <div className="main-container">
      <div className="main-header">
        <div className="title">
          <h1>{TITLE}</h1>
        </div>
        <div className="wallet-section">
          <AccountDropdown />
        </div>
      </div>

      <div className="main-content">
        <Outlet />
        {!isGalleryHidden && <PetGallery />}
      </div>

      <SolanaWalletTrigger />
    </div>
  );
};

export default Layout;
