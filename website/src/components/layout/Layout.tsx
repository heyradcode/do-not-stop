'use client';

import React from 'react';

import SiteHeader from '@/components/layout/SiteHeader';
import useRevealObserver from '@/hooks/useRevealObserver';

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
  useRevealObserver();

  const containerClass = ['main-container', containerClassName].filter(Boolean).join(' ');
  const contentClass = ['main-content', contentClassName].filter(Boolean).join(' ');

  return (
    <div className={containerClass}>
      <SiteHeader title={title} />
      <div className={contentClass}>{children}</div>
    </div>
  );
};

export default Layout;
