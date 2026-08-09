'use client';

import { useEffect } from 'react';

const VISIBLE_ATTR = 'data-reveal-visible';
const DEFAULT_STAGGER_MS = 70;

/** Past this many siblings the stagger stops growing, or late rows crawl in. */
const MAX_STAGGER_STEPS = 8;

/**
 * Watches every `[data-reveal]` element on the page and marks it visible as it
 * scrolls into view.
 *
 * Mounted once in `Layout` rather than per section, so the landing sections stay
 * server components — they only need the attribute in their markup, not a client
 * boundary of their own.
 */
export default function useRevealObserver() {
  useEffect(() => {
    const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (targets.length === 0) return;

    // The CSS also honours the preference, but bailing here avoids installing an
    // observer that would only ever toggle attributes nothing reads.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      targets.forEach((el) => el.setAttribute(VISIBLE_ATTR, ''));
      return;
    }

    // Stagger delay is assigned here rather than with nth-child rules so a
    // container can hold any number of children without a rule per position.
    document.querySelectorAll<HTMLElement>('[data-reveal-stagger]').forEach((group) => {
      const step = Number(group.dataset.revealStagger) || DEFAULT_STAGGER_MS;
      group.querySelectorAll<HTMLElement>('[data-reveal]').forEach((child, index) => {
        child.style.setProperty('--reveal-delay', `${Math.min(index, MAX_STAGGER_STEPS) * step}ms`);
      });
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.setAttribute(VISIBLE_ATTR, '');
          // Reveal once. Re-hiding content the reader has already passed is
          // disorienting, and it keeps the observer's work bounded.
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 },
    );

    targets.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);
}
