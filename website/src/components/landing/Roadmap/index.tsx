import { ROADMAP, ROADMAP_STATUS_LABEL } from '@/content/landing';
import './Roadmap.css';

const Roadmap = () => (
  <section className="landing-section roadmap" id="roadmap">
    <h3 className="section-title">Roadmap</h3>
    <p className="section-subtitle">Where we&apos;ve been, what&apos;s shipping next.</p>
    <ol className="track">
      {ROADMAP.map(({ quarter, title, status, bullets }, idx) => (
        <li className={`stop status-${status} ${idx % 2 === 0 ? 'above' : 'below'}`} key={quarter}>
          <div className="card">
            <div className="head">
              <span className="quarter">{quarter}</span>
              <span className="status">{ROADMAP_STATUS_LABEL[status]}</span>
            </div>
            <h4>{title}</h4>
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
