import type { CSSProperties } from 'react';

import { ROADMAP, ROADMAP_STATUS_LABEL, SECTION_COPY } from '@/content/landing';
import './Roadmap.css';

const { title: sectionTitle, subtitle } = SECTION_COPY.roadmap;

/**
 * How far the rail fills: to the centre of the last stop that is not still
 * planned. Derived from the data so re-ordering or shipping a milestone moves
 * the rail on its own — the previous rail encoded "two shipped, third running"
 * as literal 50% and 75% gradient stops, which silently lied the moment the
 * roadmap changed.
 */
const lastLiveIndex = ROADMAP.reduce(
  (found, item, index) => (item.status === 'planned' ? found : index),
  -1,
);

const railFill =
  lastLiveIndex < 0 ? '0%' : `${((lastLiveIndex + 0.5) / ROADMAP.length) * 100}%`;

const Roadmap = () => (
  <section className="landing-section roadmap" id="roadmap" data-wash="cyan">
    <h2 className="section-title" data-reveal="up">{sectionTitle}</h2>
    <p className="section-subtitle" data-reveal="up">{subtitle}</p>
    <ol
      className="track"
      style={{ '--rail-fill': railFill } as CSSProperties}
      data-reveal="fade"
      data-reveal-stagger="130"
    >
      {ROADMAP.map(({ quarter, title, status, bullets }, idx) => (
        <li
          className={`stop status-${status} ${idx % 2 === 0 ? 'above' : 'below'}`}
          key={quarter}
          data-reveal="rise"
        >
          <div className="card">
            <div className="head">
              <span className="quarter">{quarter}</span>
              <span className="status">{ROADMAP_STATUS_LABEL[status]}</span>
            </div>
            <h3>{title}</h3>
            <ul>
              {bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </div>
          <span className="pin" aria-hidden="true" />
        </li>
      ))}
    </ol>
  </section>
);

export default Roadmap;
