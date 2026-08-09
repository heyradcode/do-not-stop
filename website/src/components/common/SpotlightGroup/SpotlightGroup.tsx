'use client';

import { useEffect, useRef, type HTMLAttributes } from 'react';

import { hasFinePointer } from '@/lib/media';
import { rafThrottle } from '@/lib/rafThrottle';

/**
 * Publishes the pointer's position over the hovered `[data-spotlight]` descendant
 * as `--mx` / `--my`, in px relative to that element's own box.
 *
 * A single delegated listener on the group rather than one per card, and a thin
 * client boundary so the section rendering the cards stays a server component.
 *
 * The layout read happens once per animation frame inside the rAF callback, not
 * in the move handler — reading `getBoundingClientRect` per pointermove forces
 * layout on every event, and pointermove fires far faster than the screen
 * refreshes.
 */
export default function SpotlightGroup({
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    // A spotlight is a hover affordance; a coarse pointer has nothing to track.
    if (!hasFinePointer()) return;

    let target: HTMLElement | null = null;
    let clientX = 0;
    let clientY = 0;

    const clear = (el: HTMLElement | null) => {
      el?.style.removeProperty('--mx');
      el?.style.removeProperty('--my');
    };

    const apply = rafThrottle(() => {
      if (!target) return;
      const rect = target.getBoundingClientRect();
      target.style.setProperty('--mx', `${clientX - rect.left}px`);
      target.style.setProperty('--my', `${clientY - rect.top}px`);
    });

    const onMove = (event: PointerEvent) => {
      const next = (event.target as Element | null)?.closest<HTMLElement>('[data-spotlight]') ?? null;

      if (next !== target) {
        clear(target);
        target = next;
      }
      if (!target) return;

      clientX = event.clientX;
      clientY = event.clientY;
      apply();
    };

    const onLeave = () => {
      clear(target);
      target = null;
    };

    root.addEventListener('pointermove', onMove, { passive: true });
    root.addEventListener('pointerleave', onLeave, { passive: true });

    return () => {
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerleave', onLeave);
      apply.cancel();
    };
  }, []);

  return (
    <div ref={ref} {...props}>
      {children}
    </div>
  );
}
