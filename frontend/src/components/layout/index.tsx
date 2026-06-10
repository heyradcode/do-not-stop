import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import AccountDropdown from '@components/wallet/account-dropdown';
import SolanaWalletTrigger from '@components/wallet/solana-wallet-trigger';
import PetGallery from '@components/pet/collection/pet-gallery';
import { isInteractionRoute } from '@constants/interactionRoutes';
import './index.css';

const TITLE = 'Crypto Pets';

/**
 * App layout: the shared chrome (header + wallet), the routed page (`<Outlet/>`),
 * and the pet collection (hidden on full-page interaction routes). Used as the
 * layout-route element wrapping every page.
 */
const Layout: React.FC = () => {
  const location = useLocation();
  /** Full-page interaction routes hide the pet collection. */
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

      <div className="main-content authenticated">
        <Outlet />
        {!isGalleryHidden && <PetGallery />}
      </div>
      <SolanaWalletTrigger />
    </div>
  );
};

export default Layout;
