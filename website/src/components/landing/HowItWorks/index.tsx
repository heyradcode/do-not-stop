import { STEPS } from '@/content/landing';
import './HowItWorks.css';

const HowItWorks = () => (
  <section className="landing-section how-it-works" id="how">
    <h3 className="section-title">How It Works</h3>
    <p className="section-subtitle">From wallet to first win in four short steps.</p>
    <ol className="track" aria-label="How it works">
      {STEPS.map(({ number, title, text }) => (
        <li className="node" key={number}>
          <span className="circle" aria-hidden="true">
            <span>{number}</span>
          </span>
          <h4>{title}</h4>
          <p>{text}</p>
        </li>
      ))}
    </ol>
  </section>
);

export default HowItWorks;
