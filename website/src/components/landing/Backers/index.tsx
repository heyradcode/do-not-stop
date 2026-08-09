import { BACKERS } from '@/content/landing';
import './Backers.css';

const Backers = () => {
  const loop = [...BACKERS, ...BACKERS];

  return (
    <section className="backers" aria-label="Powered by">
      <p className="label" data-reveal="up">Powered by &amp; built with</p>
      <div className="marquee" data-reveal="fade">
        <ul className="row">
          {loop.map(({ name }, idx) => (
            <li key={`${name}-${idx}`}>{name}</li>
          ))}
        </ul>
      </div>
    </section>
  );
};

export default Backers;
