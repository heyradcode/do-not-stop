import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import AppShell from '@components/layout/app-shell';
import SolanaWalletTrigger from '@components/wallet/solana-wallet-trigger';
import PetGallery from '@components/pet/collection/pet-gallery';
import { isInteractionRoute } from '@constants/interactionRoutes';
import './index.css';

const Layout: React.FC = () => {
    const location = useLocation();
    const isGalleryHidden = isInteractionRoute(location.pathname);

    return (
        <AppShell>
            <Outlet />
            {!isGalleryHidden && <PetGallery />}
            <SolanaWalletTrigger />
        </AppShell>
    );
};

export default Layout;
