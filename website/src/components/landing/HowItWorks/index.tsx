import { STEPS } from '@/content/landing';
import './HowItWorks.css';

const HowItWorks = () => (
  <section className="landing-section how-it-works" id="how" data-wash="cyan">
    <h2 className="section-title" data-reveal="up">How It Works</h2>
    <p className="section-subtitle" data-reveal="up">From wallet to first win in four short steps.</p>
    <ol className="track" aria-label="How it works" data-reveal-stagger>
      {STEPS.map(({ number, title, text }) => (
        <li className="node" key={number} data-reveal="rise">
          <span className="circle" aria-hidden="true">
            <span>{number}</span>
          </span>
          <h3>{title}</h3>
          <p>{text}</p>
        </li>
      ))}
    </ol>
  </section>
);

export default HowItWorks;
