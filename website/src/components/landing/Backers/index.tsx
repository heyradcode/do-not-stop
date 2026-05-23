import { BACKERS } from '@/content/landing';
import './Backers.css';

const Backers = () => {
  const loop = [...BACKERS, ...BACKERS];

  return (
    <section className="backers" aria-label="Powered by">
      <p className="label">Powered by &amp; built with</p>
      <div className="marquee">
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
