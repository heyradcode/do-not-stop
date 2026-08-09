'use client';

import { useEffect, useRef } from 'react';

import { STATS, type Stat } from '@/content/landing';
import { prefersReducedMotion } from '@/lib/media';
import './Stats.css';

const COUNT_MS = 1500;

const format = ({ prefix = '', suffix = '', decimals = 0 }: Stat, n: number) =>
  `${prefix}${n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}${suffix}`;

const Stats = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const valueRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const write = (progress: number) => {
      STATS.forEach((item, index) => {
        const el = valueRefs.current[index];
        if (el) el.textContent = format(item, item.value * progress);
      });
    };

    if (prefersReducedMotion()) return;

    let frame = 0;
    let startedAt = 0;

    const tick = (now: number) => {
      if (!startedAt) startedAt = now;
      const t = Math.min((now - startedAt) / COUNT_MS, 1);
      write(1 - (1 - t) ** 3);
      if (t < 1) frame = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        // Count once. Replaying on every pass turns a flourish into a tic.
        observer.disconnect();
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.35 },
    );

    observer.observe(section);

    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="stats"
      aria-label="Project statistics"
      id="stats"
      data-reveal-stagger="80"
    >
      {STATS.map((item, index) => (
        <div className="item" key={item.label} data-reveal="up">
          {/* Rendered at its final value so the figure is correct before hydration
              and without JS; the counter only rewinds once it is on screen. */}
          <strong
            ref={(el) => {
              valueRefs.current[index] = el;
            }}
          >
            {format(item, item.value)}
          </strong>
          <span>{item.label}</span>
        </div>
      ))}
    </section>
  );
};

export default Stats;
