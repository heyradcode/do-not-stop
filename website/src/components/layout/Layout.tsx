'use client';

import React from 'react';

import { NeonButton } from '@/components/common';
import useRevealObserver from '@/hooks/useRevealObserver';
import { openApp } from '@/lib/openApp';

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
      <div className="main-header">
        <div className="title">
          {/* Brand lockup, not a heading — the page's single h1 is the hero
              headline. A site name in the header is a landmark label, and
              making it h1 pushed every real heading down a level. */}
          <span className="brand-name">{title}</span>
        </div>
        <div className="wallet-section">
          <NeonButton type="button" tone="emerald" onClick={openApp}>
            Play Now
          </NeonButton>
        </div>
      </div>

      <div className={contentClass}>{children}</div>
    </div>
  );
};

export default Layout;
