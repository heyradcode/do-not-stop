'use client';

import { useCallback, useRef, type CSSProperties } from 'react';
import Image from 'next/image';

import { ROADMAP, ROADMAP_STATUS_LABEL, SECTION_COPY } from '@/content/landing';
import useScrollScene from '@/hooks/useScrollScene';
import './Roadmap.css';

const { title: sectionTitle, subtitle } = SECTION_COPY.roadmap;

/** Road canvas. Stretched to fit, so these are proportions, not pixels. */
const VIEW_W = 1000;
const VIEW_H = 200;
const CREST = 56;
const TROUGH = 144;
const MID = (CREST + TROUGH) / 2;

const COUNT = ROADMAP.length;
const SLICE = 1 / COUNT;

/**
 * Builds the road as a smooth curve through one point per phase, alternating
 * crest and trough. Generated rather than hand-drawn so adding or removing a
 * phase reshapes the road instead of leaving a marker off the tarmac.
 */
const buildRoad = (count: number) => {
  const points: [number, number][] = [
    [0, MID],
    ...Array.from({ length: count }, (_, i): [number, number] => [
      ((i + 0.5) / count) * VIEW_W,
      i % 2 === 0 ? CREST : TROUGH,
    ]),
    [VIEW_W, MID],
  ];

  return points.slice(1).reduce((d, [x, y], index) => {
    const [px, py] = points[index]!;
    const handle = (x - px) / 2;
    return `${d} C ${px + handle} ${py}, ${x - handle} ${y}, ${x} ${y}`;
  }, `M ${points[0]![0]} ${points[0]![1]}`);
};

const ROAD_PATH = buildRoad(COUNT);

const Check = () => (
  <svg className="glyph" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 12.5 10 17.5 19 7" />
  </svg>
);

const Roadmap = () => {
  const laneRef = useRef<SVGPathElement>(null);
  const headRef = useRef<SVGGElement>(null);
  const laneLength = useRef(0);
  const markers = useRef<(HTMLElement | null)[]>([]);
  const stages = useRef<(HTMLElement | null)[]>([]);

  const onFrame = useCallback((progress: number, section: HTMLElement) => {
    section.style.setProperty('--track-progress', progress.toFixed(4));

    // The active phase drives the scene hue, the HUD readout and the ghost
    // numeral through one attribute. Written only on change — every CSS
    // selector keyed to it invalidates when it flips.
    const active = Math.min(Math.floor(progress / SLICE), COUNT - 1);
    if (section.dataset.phase !== String(active)) {
      section.dataset.phase = String(active);
    }

    // Park the comet on the curve itself. getTotalLength is measured once —
    // it cannot change unless the path does, and it is the costly half.
    const lane = laneRef.current;
    const head = headRef.current;
    if (lane && head) {
      if (!laneLength.current) laneLength.current = lane.getTotalLength();
      const point = lane.getPointAtLength(progress * laneLength.current);
      head.setAttribute('transform', `translate(${point.x} ${point.y})`);
    }

    markers.current.forEach((el, index) => {
      el?.toggleAttribute('data-reached', progress >= (index + 0.5) * SLICE);
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
        {/* Backdrop: parallax starfield plus a nebula that borrows the active
            phase's hue via currentColor, so the whole sky retints as the
            journey advances. */}
        <div className="scene" aria-hidden="true">
          <span className="stars s1" />
          <span className="stars s2" />
          <span className="stars s3" />
          <span className="nebula" />
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

        <div className="road">
          <svg
            className="tarmac"
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {/* pathLength normalises every lane to 1, so all the dash maths
                below is written directly in progress fractions. */}
            <path className="lane lane-base" d={ROAD_PATH} pathLength={1} />
            <path className="lane lane-dash" d={ROAD_PATH} pathLength={1} />
            <path
              ref={laneRef}
              className="lane lane-fill"
              d={ROAD_PATH}
              pathLength={1}
            />
            <path className="lane lane-comet" d={ROAD_PATH} pathLength={1} />
            <g ref={headRef} className="head">
              <circle className="head-glow" r="14" />
              <circle className="head-core" r="5" />
            </g>
          </svg>

          <ol className="markers">
            {ROADMAP.map(({ phase, status }, index) => (
              <li
                key={phase}
                className={`marker status-${status}`}
                data-side={index % 2 === 0 ? 'crest' : 'trough'}
                ref={(el) => {
                  markers.current[index] = el;
                }}
              >
                <span className="dot" aria-hidden="true">
                  {status === 'shipped' && <Check />}
                  {status === 'in-progress' && <span className="pip" />}
                </span>
                <span className="tag">{phase}</span>
              </li>
            ))}
          </ol>
        </div>

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
