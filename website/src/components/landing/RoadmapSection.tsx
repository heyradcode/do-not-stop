import { LANDING_ROADMAP } from '../../constants/landingContent';
import './RoadmapSection.css';

const STATUS_LABEL: Record<string, string> = {
  shipped: 'Shipped',
  'in-progress': 'In progress',
  planned: 'Planned',
};

export default function RoadmapSection() {
  return (
    <section className="landing-section roadmap" id="roadmap">
      <h3 className="section-title">Roadmap</h3>
      <p className="section-subtitle">Where we&apos;ve been, what&apos;s shipping next.</p>
      <ol className="roadmap-grid">
        {LANDING_ROADMAP.map((item) => (
          <li className={`roadmap-card status-${item.status}`} key={item.quarter}>
            <div className="roadmap-card-head">
              <span className="roadmap-quarter">{item.quarter}</span>
              <span className="roadmap-status">{STATUS_LABEL[item.status]}</span>
            </div>
            <h4>{item.title}</h4>
            <ul>
              {item.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}
