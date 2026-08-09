'use client';

import { useEffect, useRef } from 'react';

/**
 * Writes the pointer's position over an element as `--tx` / `--ty`, each
 * normalised to -1..1 from the centre. Consumers decide how many degrees that
 * is worth.
 *
 * Opt-out is structural: on coarse pointers there is no hover position to
 * track, and under reduced motion a tilting scene is exactly the kind of thing
 * the preference exists to stop. In both cases no listener is attached, so
 * there is no per-move cost to discard.
 *
 * The rect is cached and re-measured on resize and scroll rather than read in
 * the move handler, where it would force layout on every event.
 */
export default function usePointerTilt<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!fine.matches || reduced.matches) return;

    let rect = el.getBoundingClientRect();
    let frame = 0;
    let x = 0;
    let y = 0;

    const apply = () => {
      frame = 0;
      el.style.setProperty('--tx', x.toFixed(3));
      el.style.setProperty('--ty', y.toFixed(3));
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };

    const onMove = (event: PointerEvent) => {
      if (rect.width === 0 || rect.height === 0) return;
      x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
      schedule();
    };

    const onLeave = () => {
      x = 0;
      y = 0;
      schedule();
    };

    const remeasure = () => {
      rect = el.getBoundingClientRect();
    };

    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerleave', onLeave, { passive: true });
    window.addEventListener('resize', remeasure, { passive: true });
    window.addEventListener('scroll', remeasure, { passive: true });

    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('resize', remeasure);
      window.removeEventListener('scroll', remeasure);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return ref;
}
