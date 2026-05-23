import { LANDING_BACKERS } from '../../constants/landingContent';
import './BackersSection.css';

export default function BackersSection() {
  return (
    <section className="backers" aria-label="Powered by">
      <p className="backers-label">Powered by &amp; built with</p>
      <ul className="backers-row">
        {LANDING_BACKERS.map((backer) => (
          <li key={backer.name}>{backer.name}</li>
        ))}
      </ul>
    </section>
  );
}
