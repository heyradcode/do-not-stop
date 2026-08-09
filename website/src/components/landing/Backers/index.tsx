import { BACKERS } from '@/content/landing';
import './Backers.css';

const Backers = () => (
  <section className="backers" aria-label="Powered by">
    <p className="label" data-reveal="up">Powered by &amp; built with</p>
    <div className="marquee" data-reveal="fade">
      <div className="row">
        <ul>
          {BACKERS.map(({ name }) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
        {/* The loop needs a second copy to scroll seamlessly, but a screen reader
            should not hear the list twice. */}
        <ul aria-hidden="true">
          {BACKERS.map(({ name }) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      </div>
    </div>
  </section>
);

export default Backers;
