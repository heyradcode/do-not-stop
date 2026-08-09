'use client';

import { useCallback, useRef, type CSSProperties } from 'react';
import Image from 'next/image';

import { ROADMAP, ROADMAP_STATUS_LABEL, SECTION_COPY } from '@/content/landing';
import useScrollScene from '@/hooks/useScrollScene';
import { clamp01 } from '@/lib/math';
import './Roadmap.css';

const { title: sectionTitle, subtitle } = SECTION_COPY.roadmap;

const COUNT = ROADMAP.length;
const SLICE = 1 / COUNT;

/* Perspective constants for the gates. A gate sits `zAhead` phases in front of
   the camera; apparent size falls off as Z0/(z+Z0), the classic 1/z with a
   softening constant so the pass never divides by zero. */
const Z0 = 0.42;
const FAR = 2.6;
const FADE_IN = 0.6;
const PASS_FADE = 0.28;
/** How far past the camera a gate keeps growing before it is fully faded.
    Kept shallow so the overshoot never balloons over the header strip. */
const PASS_OVERSHOOT = 0.18;

const Roadmap = () => {
  const gates = useRef<(HTMLElement | null)[]>([]);
  const stages = useRef<(HTMLElement | null)[]>([]);

  const onFrame = useCallback((progress: number, section: HTMLElement) => {
    // `--track-progress` is published by useScrollScene itself.

    // The active phase drives the scene hue, the HUD readout and the stage
    // swap through one attribute. Written only on change — every selector
    // keyed to it invalidates when it flips.
    const active = Math.min(Math.floor(progress / SLICE), COUNT - 1);
    if (section.dataset.phase !== String(active)) {
      section.dataset.phase = String(active);
    }

    // Fly each gate along the road. Passed gates keep growing for a beat while
    // they fade, which is what sells the fly-through.
    gates.current.forEach((el, index) => {
      if (!el) return;
      const zAhead = index + 0.5 - progress * COUNT;
      const s = Z0 / (Math.max(zAhead, -PASS_OVERSHOOT) + Z0);

      let opacity: number;
      if (zAhead <= 0) opacity = clamp01(1 + zAhead / PASS_FADE);
      else if (zAhead >= FAR) opacity = 0;
      else if (zAhead > FAR - FADE_IN) opacity = (FAR - zAhead) / FADE_IN;
      else opacity = 1;

      // The flight corridor stays inside the road band: gates descend from the
      // horizon (54% from the bottom) only to ~44%, which sits above the
      // enlarged stage area at every viewport this scene runs on. Nearness is
      // carried almost entirely by scale, and transform-origin pins the base so
      // the pass overshoot grows upward, away from the cards.
      el.style.setProperty('--gs', s.toFixed(4));
      el.style.setProperty('--gb', `${(54 - 10 * Math.min(s, 1)).toFixed(2)}%`);
      el.style.setProperty('--go', opacity.toFixed(3));
    });

    stages.current.forEach((el, index) => {
      if (!el) return;
      const state = index < active ? 'behind' : index > active ? 'ahead' : 'active';
      if (el.dataset.state !== state) el.dataset.state = state;
    });
  }, []);

  const { sectionRef, pinRef } = useScrollScene(onFrame);

  return (
    <section
      ref={sectionRef}
      className="landing-section roadmap"
      id="roadmap"
      data-phase="0"
      style={{ '--phase-count': COUNT } as CSSProperties}
    >
      <div className="pin" ref={pinRef}>
        {/* Backdrop: starfield and nebula above the horizon, a perspective
            grid floor below it. The floor's grid streams toward the camera as
            progress advances, so scrolling reads as driving. */}
        <div className="scene" aria-hidden="true">
          <span className="stars s1" />
          <span className="stars s2" />
          <span className="stars s3" />
          <span className="nebula" />
          <span className="horizon" />
          <span className="floor-wrap">
            <span className="floor" />
          </span>
          <span className="frame-fade" />
        </div>

        {/* Neon gates standing on the road, one per phase. They approach from
            the horizon and sweep past the camera as their phase arrives. */}
        <div className="gates" aria-hidden="true">
          {ROADMAP.map(({ phase, status }, index) => (
            <span
              key={phase}
              className={`gate status-${status}`}
              ref={(el) => {
                gates.current[index] = el;
              }}
            >
              <span className="gate-label">{phase}</span>
            </span>
          ))}
        </div>

        <header className="strip">
          <div className="strip-copy">
            <h2 className="section-title">{sectionTitle}</h2>
            <p className="section-subtitle">{subtitle}</p>
          </div>

          <div className="hud" aria-hidden="true">
            <div className="hud-count">
              <span className="hud-now">
                {ROADMAP.map(({ phase }, index) => (
                  <span key={phase} data-idx={index}>{phase}</span>
                ))}
              </span>
              <span className="hud-total">/ {String(COUNT).padStart(2, '0')}</span>
            </div>
            <span className="hud-bar" />
          </div>
        </header>

        {/* Every stage stays in the document; only its visual state changes, so
            the whole roadmap is available to a screen reader at any scroll
            position rather than one card at a time. */}
        <ol className="stages">
          {ROADMAP.map(({ phase, title, status, bullets, art }, index) => (
            <li
              key={phase}
              className={`stage status-${status}`}
              data-state={index === 0 ? 'active' : 'ahead'}
              ref={(el) => {
                stages.current[index] = el;
              }}
            >
              <span className="numeral" aria-hidden="true">{phase}</span>

              <div className="panel">
                <div className="head">
                  <span className="phase">{phase}</span>
                  <span className="status">{ROADMAP_STATUS_LABEL[status]}</span>
                </div>
                <h3>{title}</h3>
                <ul>
                  {bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </div>

              <div className="holo" aria-hidden="true">
                <Image src={art} alt="" width={512} height={512} sizes="260px" />
                <span className="holo-scan" />
                <span className="holo-glint" />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
};

export default Roadmap;
