import React from 'react';

import AccountDropdown from '../wallet/account-dropdown';
import SolanaWalletTrigger from '../wallet/solana-wallet-trigger';
import './index.css';

type LayoutProps = {
  children: React.ReactNode;
  containerClassName?: string;
  contentClassName?: string;
  title?: string;
};

const Layout: React.FC<LayoutProps> = ({
  children,
  containerClassName,
  contentClassName,
  title = 'Crypto Pets',
}) => {
  const containerClass = ['main-container', containerClassName].filter(Boolean).join(' ');
  const contentClass = ['main-content', contentClassName].filter(Boolean).join(' ');

  return (
    <div className={containerClass}>
      <div className="main-header">
        <div className="title">
          <h1>{title}</h1>
        </div>
        <div className="wallet-section">
          <AccountDropdown />
        </div>
      </div>

      <div className={contentClass}>{children}</div>
      <SolanaWalletTrigger />
    </div>
  );
};

export default Layout;
