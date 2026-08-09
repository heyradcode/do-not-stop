'use client';

import { useEffect, useRef } from 'react';

/** Fraction of the viewport height at which the track starts filling. */
const ENTER_AT = 0.82;
/** Share of the track's own height over which the fill completes. */
const SPAN = 0.62;

const clamp = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Drives a 0-1 `--track-progress` on an element from its position in the
 * viewport, and stamps `data-reached` on any descendant carrying `data-at` once
 * progress passes that descendant's threshold.
 *
 * Written straight to the DOM rather than held in React state: this updates on
 * every frame of a scroll, and re-rendering a section that often to move a
 * stroke offset would be the expensive way to do it.
 *
 * Scroll-linked rather than fired once on entry, because here the progress is
 * the content — the road is showing how far the project has actually got. CSS
 * `animation-timeline` would express this natively but has no Safari support,
 * so it is one rAF-throttled passive listener instead.
 */
export default function useTrackProgress<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const marks = Array.from(el.querySelectorAll<HTMLElement>('[data-at]'));

    const write = (progress: number) => {
      el.style.setProperty('--track-progress', progress.toFixed(4));
      marks.forEach((mark) => {
        const at = Number(mark.dataset.at);
        if (progress >= at) mark.setAttribute('data-reached', '');
        else mark.removeAttribute('data-reached');
      });
    };

    // Reduced motion still gets the finished road, just not the drawing of it.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      write(1);
      return;
    }

    let frame = 0;

    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const enter = window.innerHeight * ENTER_AT;
      write(clamp((enter - rect.top) / (rect.height * SPAN)));
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return ref;
}
