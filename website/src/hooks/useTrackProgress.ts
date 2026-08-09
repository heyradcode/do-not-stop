'use client';

import { useEffect, useRef } from 'react';

/** Fraction of the viewport height at which the track starts advancing. */
const ENTER_AT = 0.9;
/** Share of the track's own height over which it completes. */
const SPAN = 0.78;

const clamp = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Drives a 0-1 `--track-progress` on an element from its position in the
 * viewport, and hands the same value to `onFrame` for anything CSS cannot
 * express on its own.
 *
 * Scroll-linked but **not** pinned: the section scrolls past at normal speed
 * and the value simply tracks where it is. That keeps a scene like this free —
 * it costs no extra page height — which matters when another section on the
 * page already owns the pinned treatment.
 *
 * Written straight to the DOM rather than held in React state, since this
 * updates on every frame of a scroll.
 */
export default function useTrackProgress<T extends HTMLElement>(
  onFrame?: (progress: number, element: T) => void,
  fallbackQuery?: string,
) {
  const ref = useRef<T>(null);
  const callback = useRef(onFrame);
  callback.current = onFrame;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const narrow = fallbackQuery ? window.matchMedia(fallbackQuery) : null;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

    let frame = 0;
    let attached = false;

    const write = (progress: number) => {
      el.style.setProperty('--track-progress', progress.toFixed(4));
      callback.current?.(progress, el);
    };

    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const enter = window.innerHeight * ENTER_AT;
      write(clamp((enter - rect.top) / (rect.height * SPAN)));
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    const attach = () => {
      if (attached) return;
      attached = true;
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll, { passive: true });
      update();
    };

    const detach = () => {
      if (!attached) return;
      attached = false;
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };

    const sync = () => {
      // Where the layout falls back to something static, the scene is handed a
      // neutral value rather than a finished one — a carousel rewound to its
      // last frame would show its final card, not its first.
      if (narrow?.matches || reduced.matches) {
        detach();
        write(0);
      } else {
        attach();
      }
    };

    sync();
    narrow?.addEventListener('change', sync);
    reduced.addEventListener('change', sync);

    return () => {
      detach();
      narrow?.removeEventListener('change', sync);
      reduced.removeEventListener('change', sync);
    };
  }, [fallbackQuery]);

  return ref;
}
