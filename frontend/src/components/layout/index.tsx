import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '@shared/core';
import AccountDropdown from '@components/wallet/account-dropdown';
import SolanaWalletTrigger from '@components/wallet/solana-wallet-trigger';
import PetGallery from '@components/pet/collection/pet-gallery';
import { isInteractionRoute } from '@constants/interactionRoutes';
import SignInGate from './sign-in-gate';
import './index.css';

const TITLE = 'Crypto Pets';

/**
 * App layout: the shared chrome (header + wallet), the routed page (`<Outlet/>`),
 * and the pet collection (hidden on full-page interaction routes). Used as the
 * layout-route element wrapping every page.
 */
const Layout: React.FC = () => {
  const location = useLocation();
  const { isAuthenticated, isRestoring } = useAuth();

  /** Full-page interaction routes hide the pet collection. */
  const isGalleryHidden = isInteractionRoute(location.pathname);

  const mainContent = (() => {
    // Brief pause while we check for a stored token — avoids a flash of the gate.
    if (isRestoring) {
      return <div className="sign-in-restoring" />;
    }
    if (!isAuthenticated) {
      return <SignInGate />;
    }
    return (
      <div className="main-content authenticated">
        <Outlet />
        {!isGalleryHidden && <PetGallery />}
      </div>
    );
  })();

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

      {mainContent}
      <SolanaWalletTrigger />
    </div>
  );
};

export default Layout;
