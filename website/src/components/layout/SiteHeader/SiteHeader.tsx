'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import clsx from 'clsx';

import { NeonButton } from '@/components/common';
import { NAV_LINKS, SITE } from '@/content/landing';
import useActiveSection from '@/hooks/useActiveSection';
import useHashLanding from '@/hooks/useHashLanding';
import useHeaderScroll from '@/hooks/useHeaderScroll';
import { prefersReducedMotion } from '@/lib/media';
import { openApp } from '@/lib/openApp';
import { findSection, scrollToSection } from '@/lib/scrollToSection';
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

  useHashLanding();

  /**
   * Takes over the anchor jump, which cannot skip a section's own top padding.
   * The landing itself is `scrollToSection`'s problem, not the header's.
   */
  const goToSection = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, href: string, fromDrawer = false) => {
      // Leave modified clicks alone so open-in-new-tab still works.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = findSection(href);
      if (!target) return;

      event.preventDefault();
      close();
      if (fromDrawer) toggleRef.current?.focus();

      scrollToSection(target, { smooth: !prefersReducedMotion() });
      window.history.pushState(null, '', href);
    },
    [close],
  );

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

      // Measured against the list's own box rather than via offsetLeft, which
      // resolves against the nearest positioned ancestor. The <li> is relatively
      // positioned to sit above the pill, so offsetLeft reported ~0 for every
      // link and the indicator stayed pinned under the first one, resizing in
      // place instead of sliding.
      const listBox = list.getBoundingClientRect();
      const linkBox = link.getBoundingClientRect();

      list.style.setProperty('--indicator-x', `${linkBox.left - listBox.left}px`);
      list.style.setProperty('--indicator-w', `${linkBox.width}px`);
      list.style.setProperty('--indicator-opacity', '1');

      // Slide only once it has a real position to slide from; the first
      // placement fades in where it belongs rather than travelling there.
      if (!list.dataset.indicatorReady) {
        requestAnimationFrame(() => {
          list.dataset.indicatorReady = 'true';
        });
      }
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
        <a className="brand" href="#top" onClick={(event) => goToSection(event, '#top')}>
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
                    onClick={(event) => goToSection(event, href)}
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
                    onClick={(event) => goToSection(event, href, true)}
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
