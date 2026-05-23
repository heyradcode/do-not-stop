import { LANDING_BACKERS } from '../../constants/landingContent';
import './BackersSection.css';

export default function BackersSection() {
  const loop = [...LANDING_BACKERS, ...LANDING_BACKERS];

  return (
    <section className="backers" aria-label="Powered by">
      <p className="backers-label">Powered by &amp; built with</p>
      <div className="backers-marquee">
        <ul className="backers-row" aria-hidden="false">
          {loop.map((backer, idx) => (
            <li key={`${backer.name}-${idx}`}>{backer.name}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
