'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

import { NeonButton } from '@/components/common';
import { NAV_LINKS, SITE } from '@/content/landing';
import useActiveSection from '@/hooks/useActiveSection';
import useHeaderScroll from '@/hooks/useHeaderScroll';
import { openApp } from '@/lib/openApp';
import './SiteHeader.css';

/** Module scope keeps the array referentially stable across renders. */
const NAV_IDS = NAV_LINKS.map(({ href }) => href.replace('#', ''));

/** Width at which the inline nav gives way to the drawer. Matches SiteHeader.css. */
const DRAWER_QUERY = '(max-width: 900px)';

type SiteHeaderProps = {
  title: string;
};

export default function SiteHeader({ title }: SiteHeaderProps) {
  const { ref, condensed } = useHeaderScroll<HTMLElement>();
  const activeId = useActiveSection(NAV_IDS);

  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Slide the indicator behind the active link. Measured rather than expressed
  // in CSS because the links are content-width, so the pill's offset and width
  // are only knowable from layout.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const position = () => {
      const link = activeId
        ? list.querySelector<HTMLElement>(`[data-nav-id="${activeId}"]`)
        : null;

      if (!link) {
        list.style.setProperty('--indicator-opacity', '0');
        return;
      }

      list.style.setProperty('--indicator-x', `${link.offsetLeft}px`);
      list.style.setProperty('--indicator-w', `${link.offsetWidth}px`);
      list.style.setProperty('--indicator-opacity', '1');
    };

    position();
    window.addEventListener('resize', position, { passive: true });
    return () => window.removeEventListener('resize', position);
  }, [activeId]);

  // Close the drawer if the viewport grows past the breakpoint while it is open,
  // otherwise it stays mounted and invisible with the page still locked.
  useEffect(() => {
    if (!open) return;

    const query = window.matchMedia(DRAWER_QUERY);
    const onChange = () => {
      if (!query.matches) close();
    };

    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    // `inert` on the page body is the trap: it removes everything behind the
    // drawer from the tab order and the accessibility tree in one attribute,
    // rather than hand-cycling focus on every Tab.
    const content = document.querySelector('.main-content');
    content?.setAttribute('inert', '');
    document.body.classList.add('is-drawer-open');
    document.addEventListener('keydown', onKeyDown);

    drawerRef.current?.querySelector('a')?.focus();

    return () => {
      content?.removeAttribute('inert');
      document.body.classList.remove('is-drawer-open');
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  const handleClose = () => {
    close();
    toggleRef.current?.focus();
  };

  return (
    <header ref={ref} className={clsx('site-header', condensed && 'is-condensed', open && 'is-open')}>
      {/* Reading progress. Sits at the viewport's top edge, outside the pill. */}
      <span className="progress" aria-hidden="true" />

      <div className="shell">
        <a className="brand" href="#top" onClick={close}>
          <span className="brand-name">{title}</span>
        </a>

        <nav className="nav" aria-label="Sections">
          <ul ref={listRef}>
            {NAV_LINKS.map(({ label, href }) => {
              const id = href.replace('#', '');
              return (
                <li key={href}>
                  <a
                    href={href}
                    data-nav-id={id}
                    aria-current={activeId === id ? 'true' : undefined}
                  >
                    {label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="actions">
          <NeonButton type="button" tone="emerald" size="sm" onClick={openApp}>
            {SITE.playCta}
          </NeonButton>

          <button
            ref={toggleRef}
            type="button"
            className="menu-toggle"
            aria-expanded={open}
            aria-controls="site-drawer"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((value) => !value)}
          >
            <span className="bars" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        ref={drawerRef}
        id="site-drawer"
        className={clsx('drawer', open && 'is-open')}
        /* `inert` rather than `hidden`: it takes the closed drawer out of the tab
           order, the a11y tree and pointer events, while still allowing the
           open/close transition that `display: none` would cancel. */
        inert={!open}
      >
        <nav aria-label="Sections">
          <ul>
            {NAV_LINKS.map(({ label, href }) => {
              const id = href.replace('#', '');
              return (
                <li key={href}>
                  <a
                    href={href}
                    aria-current={activeId === id ? 'true' : undefined}
                    onClick={handleClose}
                  >
                    {label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      <div className="scrim" onClick={handleClose} aria-hidden="true" />
    </header>
  );
}
