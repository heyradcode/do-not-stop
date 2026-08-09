'use client';

import { useEffect, useRef, useState } from 'react';

/** Distance scrolled before the header condenses, in px. */
const CONDENSE_AT = 24;

/**
 * Tracks page scroll for the site header: a `condensed` flag for the glass
 * treatment, and a 0-1 `--scroll-progress` custom property for the progress
 * hairline.
 *
 * Progress is written straight to the element as a CSS variable rather than
 * held in React state, so the bar tracks scroll without re-rendering the header
 * on every frame. `condensed` is state because it flips twice per page, not
 * sixty times per second.
 */
export default function useHeaderScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [condensed, setCondensed] = useState(false);

  useEffect(() => {
    const header = ref.current;
    let frame = 0;

    /**
     * Publishes the header's real height so anchor offsets cannot drift from
     * the chrome they exist to clear. The header keeps one height in both its
     * states, so there is a single value to publish and no need to guess which
     * state a reader will arrive in.
     */
    const publishHeight = () => {
      if (!header) return;
      document.documentElement.style.setProperty(
        '--header-h',
        `${Math.round(header.getBoundingClientRect().height)}px`,
      );
    };

    const sizeObserver = header ? new ResizeObserver(publishHeight) : null;
    if (header && sizeObserver) sizeObserver.observe(header);
    publishHeight();

    const update = () => {
      frame = 0;
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - doc.clientHeight;
      const y = window.scrollY;

      ref.current?.style.setProperty(
        '--scroll-progress',
        scrollable > 0 ? String(Math.min(y / scrollable, 1)) : '0',
      );
      setCondensed(y > CONDENSE_AT);
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      sizeObserver?.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return { ref, condensed };
}
