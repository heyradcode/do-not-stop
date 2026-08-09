'use client';

import { useEffect, useState } from 'react';

/**
 * Reports which section id is currently under the reader.
 *
 * Detection uses a thin horizontal band near the top of the viewport (via
 * rootMargin) rather than "most visible element". Sections here differ wildly in
 * height — the FAQ is a fraction of the Pets grid — so a ratio-based winner would
 * keep the tallest section highlighted while the reader is well inside a shorter
 * one. Contiguous sections mean exactly one crosses the band at a time.
 *
 * When nothing crosses it (above the first section, or in a band-height gap) the
 * previous value is kept, so the indicator never flickers off mid-scroll.
 *
 * @param ids Section ids in document order. Must be referentially stable.
 */
export default function useActiveSection(ids: string[]) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    if (elements.length === 0) return;

    const intersecting = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) intersecting.add(entry.target.id);
          else intersecting.delete(entry.target.id);
        });

        const next = ids.find((id) => intersecting.has(id));
        if (next) setActive(next);
      },
      { rootMargin: '-25% 0px -65% 0px' },
    );

    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [ids]);

  return active;
}
