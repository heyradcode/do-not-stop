'use client';

import { useEffect } from 'react';

import { findSection, scrollToSection } from '@/lib/scrollToSection';

/**
 * Corrects the browser's native hash jump on first load.
 *
 * Arriving at `/#roadmap` scrolls before the page can say where that section
 * should land: the jump uses `scroll-padding-top` against the section's border
 * box, so it cannot skip the section's own top padding, and the header height
 * it clears is still the fallback constant. Re-running the real landing once
 * layout exists puts it where a nav click would.
 */
export default function useHashLanding() {
  useEffect(() => {
    const { hash } = window.location;
    if (!hash || hash === '#top') return;

    const target = findSection(hash);
    if (!target) return;

    const frame = requestAnimationFrame(() => scrollToSection(target, { smooth: false }));
    return () => cancelAnimationFrame(frame);
  }, []);
}
