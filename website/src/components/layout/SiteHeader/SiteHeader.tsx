'use client';

import clsx from 'clsx';

import { NeonButton } from '@/components/common';
import { NAV_LINKS } from '@/content/landing';
import useHeaderScroll from '@/hooks/useHeaderScroll';
import { openApp } from '@/lib/openApp';
import './SiteHeader.css';

type SiteHeaderProps = {
  title: string;
};

export default function SiteHeader({ title }: SiteHeaderProps) {
  const { ref, condensed } = useHeaderScroll<HTMLElement>();

  return (
    <header ref={ref} className={clsx('site-header', condensed && 'is-condensed')}>
      {/* Reading progress. Sits at the viewport's top edge, outside the pill. */}
      <span className="progress" aria-hidden="true" />

      <div className="shell">
        <a className="brand" href="#top">
          <span className="brand-name">{title}</span>
        </a>

        <nav className="nav" aria-label="Sections">
          <ul>
            {NAV_LINKS.map(({ label, href }) => (
              <li key={href}>
                <a href={href}>{label}</a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="actions">
          <NeonButton type="button" tone="emerald" size="sm" onClick={openApp}>
            Play Now
          </NeonButton>
        </div>
      </div>
    </header>
  );
}
