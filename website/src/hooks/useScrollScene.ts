'use client';

import { useEffect, useRef } from 'react';

import { clamp01 } from '@/lib/math';
import { REDUCED_MOTION } from '@/lib/media';
import { rafThrottle } from '@/lib/rafThrottle';

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
export default function useScrollScene<
  S extends HTMLElement = HTMLElement,
  P extends HTMLElement = HTMLDivElement,
>(
  onFrame: (progress: number, section: S) => void,
  {
    fallbackQuery = '(max-width: 1024px)',
    /**
     * Value handed to the scene when pinning is off. A road wants its finished
     * state; a carousel wants its first frame, since rewinding one to the end
     * parks it on the last card.
     */
    fallbackValue = 1,
  }: { fallbackQuery?: string; fallbackValue?: number } = {},
) {
  const sectionRef = useRef<S>(null);
  const pinRef = useRef<P>(null);
  const callback = useRef(onFrame);
  callback.current = onFrame;

  useEffect(() => {
    const section = sectionRef.current;
    const pin = pinRef.current;
    if (!section || !pin) return;

    const narrow = window.matchMedia(fallbackQuery);
    const reduced = window.matchMedia(REDUCED_MOTION);

    let attached = false;

    /* Cached between frames. These change when the viewport does, not when the
       page scrolls, and reading them per frame costs a style recalc plus two
       layout reads on every frame of every scroll — doubled, since two scenes
       are mounted. Only the scroll position below is read live. */
    let scrollable = 0;
    let stickyTop = 0;

    const measure = () => {
      stickyTop = parseFloat(getComputedStyle(pin).top) || 0;
      scrollable = section.offsetHeight - pin.offsetHeight;
    };

    /**
     * The hook owns the custom property, not its callers. Leaving that to each
     * onFrame meant a scene could silently render frozen if its callback forgot
     * to publish the value it was handed.
     */
    const write = (progress: number) => {
      section.style.setProperty('--track-progress', progress.toFixed(4));
      callback.current(progress, section);
    };

    const update = () => {
      if (scrollable <= 0) {
        write(1);
        return;
      }
      const travelled = stickyTop - section.getBoundingClientRect().top;
      write(clamp01(travelled / scrollable));
    };

    const onScroll = rafThrottle(update);

    /* Both elements are sized in viewport units, so this fires on viewport
       resize as well as any layout change that moves them. */
    const sizeObserver = new ResizeObserver(() => {
      measure();
      if (attached) update();
    });
    sizeObserver.observe(section);
    sizeObserver.observe(pin);

    const attach = () => {
      if (attached) return;
      attached = true;
      window.addEventListener('scroll', onScroll, { passive: true });
      measure();
      update();
    };

    const detach = () => {
      if (!attached) return;
      attached = false;
      window.removeEventListener('scroll', onScroll);
      onScroll.cancel();
    };

    const sync = () => {
      if (narrow.matches || reduced.matches) {
        detach();
        write(fallbackValue);
      } else {
        attach();
      }
    };

    sync();
    narrow.addEventListener('change', sync);
    reduced.addEventListener('change', sync);

    return () => {
      detach();
      sizeObserver.disconnect();
      narrow.removeEventListener('change', sync);
      reduced.removeEventListener('change', sync);
    };
  }, [fallbackQuery, fallbackValue]);

  return { sectionRef, pinRef };
}
