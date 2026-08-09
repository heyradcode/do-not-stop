'use client';

import { useEffect, useRef } from 'react';

const clamp = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Drives a 0-1 progress value from how far a tall section has been scrolled
 * past, while a sticky child stays pinned in view.
 *
 * Native sticky positioning, never wheel interception. The page scrolls
 * normally the whole time — the scrollbar reflects real position, PageDown and
 * arrow keys work, and a reader can leave whenever they like. Only the visual
 * holds still. Hijacking the wheel would buy the same look and take all of that
 * away.
 *
 * Pinning is a desktop, full-motion affordance. On narrow viewports (where a
 * pinned panel fights the mobile URL bar and leaves no room for the content)
 * and under reduced motion, the listener is never attached and the scene is
 * handed straight to its finished state.
 */
export default function useScrollScene(
  onFrame: (progress: number, section: HTMLElement) => void,
  fallbackQuery = '(max-width: 1024px)',
) {
  const sectionRef = useRef<HTMLElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const callback = useRef(onFrame);
  callback.current = onFrame;

  useEffect(() => {
    const section = sectionRef.current;
    const pin = pinRef.current;
    if (!section || !pin) return;

    const narrow = window.matchMedia(fallbackQuery);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

    let frame = 0;
    let attached = false;

    const update = () => {
      frame = 0;
      const scrollable = section.offsetHeight - pin.offsetHeight;
      if (scrollable <= 0) {
        callback.current(1, section);
        return;
      }
      const stickyTop = parseFloat(getComputedStyle(pin).top) || 0;
      const travelled = stickyTop - section.getBoundingClientRect().top;
      callback.current(clamp(travelled / scrollable), section);
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
      if (narrow.matches || reduced.matches) {
        detach();
        callback.current(1, section);
      } else {
        attach();
      }
    };

    sync();
    narrow.addEventListener('change', sync);
    reduced.addEventListener('change', sync);

    return () => {
      detach();
      narrow.removeEventListener('change', sync);
      reduced.removeEventListener('change', sync);
    };
  }, [fallbackQuery]);

  return { sectionRef, pinRef };
}
