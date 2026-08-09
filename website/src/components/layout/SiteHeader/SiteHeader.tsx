'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
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

/**
 * How far `target` is from where it should land, in px.
 *
 * Two cases, because the header is a floating pill and not an opaque bar —
 * nothing hides the strip of viewport around it, so a landing must never leave
 * the previous section visible in that strip:
 *
 * - A section with a full-viewport pinned scene lands flush at the viewport
 *   top. The scene owns the whole screen and pads its own content clear of the
 *   glass.
 * - Any other section lands with its content resting at the anchor offset when
 *   its own top padding is deep enough to reach the border, and at the
 *   header's edge otherwise — never higher, so the heading cannot tuck under
 *   the glass, and never lower than its padding can cover, so the previous
 *   section's tail cannot show above the border.
 *
 * The offset is read back from the resolved `scroll-padding-top`: custom
 * properties do not resolve calc() through getComputedStyle, real properties
 * do, so this is the one place the number exists and JS and CSS cannot drift.
 */
const landingError = (target: Element) => {
  const pin = target.querySelector('.pin');
  if (pin && getComputedStyle(pin).position === 'sticky') {
    return Math.round(target.getBoundingClientRect().top);
  }

  const root = getComputedStyle(document.documentElement);
  const offset = parseFloat(root.scrollPaddingTop) || 0;
  const gap = parseFloat(root.getPropertyValue('--anchor-gap')) || 0;
  const headerHeight = offset - gap;

  const padding = parseFloat(getComputedStyle(target).paddingTop) || 0;
  const contentY = Math.max(headerHeight, Math.min(padding, offset));

  return Math.round(target.getBoundingClientRect().top + padding - contentY);
};

/**
 * Once the scroll has come to rest, re-measure and instantly remove whatever
 * error remains. A single scrollTo cannot be pixel-perfect: any layout shift
 * while the animation runs — an image decoding, a font swapping, dvh settling —
 * moves the target by exactly the amount the landing ends up off by.
 *
 * Cancelled the moment the reader scrolls themselves, so the correction can
 * never yank the page away from someone who changed their mind mid-flight.
 */
const settleOnArrival = (target: Element) => {
  let cancelled = false;

  const cancel = () => {
    cancelled = true;
    cleanup();
  };

  const cleanup = () => {
    window.removeEventListener('wheel', cancel);
    window.removeEventListener('touchstart', cancel);
    window.removeEventListener('keydown', cancel);
    window.removeEventListener('scrollend', onEnd);
  };

  const correct = () => {
    if (cancelled) return;
    const error = landingError(target);
    if (Math.abs(error) > 1) window.scrollBy({ top: error, behavior: 'auto' });
  };

  const onEnd = () => {
    cleanup();
    correct();
  };

  window.addEventListener('wheel', cancel, { passive: true, once: true });
  window.addEventListener('touchstart', cancel, { passive: true, once: true });
  window.addEventListener('keydown', cancel, { once: true });

  if ('onscrollend' in window) {
    window.addEventListener('scrollend', onEnd, { once: true });
  } else {
    // Safari has no scrollend: treat three frames without movement as arrival.
    let last = -1;
    let still = 0;
    const tick = () => {
      if (cancelled) return;
      const y = window.scrollY;
      if (Math.abs(y - last) < 1) {
        if (++still >= 3) {
          cleanup();
          correct();
          return;
        }
      } else {
        still = 0;
      }
      last = y;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
};

const scrollToTarget = (target: Element, smooth: boolean) => {
  const top = window.scrollY + landingError(target);
  window.scrollTo({ top: Math.max(top, 0), behavior: smooth ? 'smooth' : 'auto' });
  settleOnArrival(target);
};

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

  /**
   * Scrolls to a section explicitly rather than leaving it to the browser's
   * anchor jump: the jump cannot skip a section's own top padding, and the
   * settle pass in scrollToTarget is what makes the landing exact.
   */
  const goToSection = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, href: string, fromDrawer = false) => {
      // Leave modified clicks alone so open-in-new-tab still works.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = document.querySelector(href);
      if (!target) return;

      event.preventDefault();
      close();
      if (fromDrawer) toggleRef.current?.focus();

      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      scrollToTarget(target, !reduced);
      window.history.pushState(null, '', href);
    },
    [close],
  );

  // Arriving with a hash in the URL takes the browser's native jump, which
  // lands on the border box with the fallback offset. Correct it once layout
  // has something real to measure.
  useEffect(() => {
    const { hash } = window.location;
    if (!hash || hash === '#top') return;

    let target: Element | null = null;
    try {
      target = document.querySelector(hash);
    } catch {
      return; // Not a valid selector — an external tool's tracking hash.
    }
    if (!target) return;

    const frame = requestAnimationFrame(() => scrollToTarget(target, false));
    return () => cancelAnimationFrame(frame);
  }, []);

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
