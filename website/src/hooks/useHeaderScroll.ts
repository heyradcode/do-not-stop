'use client';

import { useEffect, useRef, useState } from 'react';

import { rafThrottle } from '@/lib/rafThrottle';

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

    /* Cached: the document's scrollable extent changes when content or the
       viewport does, not on every frame of a scroll. Reading scrollHeight per
       frame forces a layout for a number that rarely moves. */
    let scrollable = 0;

    const measure = () => {
      const doc = document.documentElement;
      scrollable = doc.scrollHeight - doc.clientHeight;
    };

    const update = () => {
      const y = window.scrollY;

      header?.style.setProperty(
        '--scroll-progress',
        scrollable > 0 ? String(Math.min(y / scrollable, 1)) : '0',
      );
      setCondensed(y > CONDENSE_AT);
    };

    const onScroll = rafThrottle(update);

    /* Watching the body catches the document growing as images decode and
       sections reveal, which is what actually changes the scrollable extent. */
    const sizeObserver = new ResizeObserver(() => {
      publishHeight();
      measure();
      onScroll();
    });
    if (header) sizeObserver.observe(header);
    sizeObserver.observe(document.body);

    publishHeight();
    measure();
    update();
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      sizeObserver.disconnect();
      onScroll.cancel();
    };
  }, []);

  return { ref, condensed };
}
