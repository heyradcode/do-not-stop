'use client';

import type { CSSProperties } from 'react';

import { ROADMAP, ROADMAP_STATUS_LABEL, SECTION_COPY } from '@/content/landing';
import useTrackProgress from '@/hooks/useTrackProgress';
import './Roadmap.css';

const { title: sectionTitle, subtitle } = SECTION_COPY.roadmap;

/** Road canvas. Stretched to fit, so these are proportions, not pixels. */
const VIEW_W = 1000;
const VIEW_H = 260;
const CREST = 68;
const TROUGH = 192;
const MID = (CREST + TROUGH) / 2;

/**
 * Builds the road as a smooth curve through one point per phase, alternating
 * crest and trough. Generated rather than hand-drawn so adding or removing a
 * phase reshapes the road instead of leaving markers off the tarmac.
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

  return points
    .slice(1)
    .reduce((d, [x, y], index) => {
      const [px, py] = points[index]!;
      const handle = (x - px) / 2;
      return `${d} C ${px + handle} ${py}, ${x - handle} ${y}, ${x} ${y}`;
    }, `M ${points[0]![0]} ${points[0]![1]}`);
};

const ROAD_PATH = buildRoad(ROADMAP.length);

const Check = () => (
  <svg className="glyph" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 12.5 10 17.5 19 7" />
  </svg>
);

const Roadmap = () => {
  const roadRef = useTrackProgress<HTMLDivElement>();

  return (
    <section className="landing-section roadmap" id="roadmap" data-wash="cyan">
      <h2 className="section-title" data-reveal="up">{sectionTitle}</h2>
      <p className="section-subtitle" data-reveal="up">{subtitle}</p>

      <div className="road" ref={roadRef}>
        <svg
          className="tarmac"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {/* pathLength normalises both strokes to 1, so the dash maths is the
              progress value itself and does not depend on the curve's length. */}
          <path className="lane lane-base" d={ROAD_PATH} pathLength={1} />
          <path className="lane lane-fill" d={ROAD_PATH} pathLength={1} />
        </svg>

        <ol className="stops">
          {ROADMAP.map(({ phase, title, status, bullets }, index) => (
            <li
              key={phase}
              className={`stop status-${status}`}
              data-side={index % 2 === 0 ? 'crest' : 'trough'}
              data-at={((index + 0.5) / ROADMAP.length).toFixed(4)}
              style={{ '--stop': index } as CSSProperties}
            >
              <span className="marker" aria-hidden="true">
                {status === 'shipped' && <Check />}
                {status === 'in-progress' && <span className="pip" />}
              </span>

              <div className="card">
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
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
};

export default Roadmap;
