import React from 'react';
import { Outlet } from 'react-router-dom';

import AppShell from '@components/layout/app-shell';
import SolanaWalletTrigger from '@components/wallet/solana-wallet-trigger';

/** App shell wrapper. Each route renders its own content into the shell's
 *  content slot; `/main` renders the idle gallery, feature routes their panels. */
const Layout: React.FC = () => (
    <AppShell>
        <Outlet />
        <SolanaWalletTrigger />
    </AppShell>
);

export default Layout;
