import { SECTION_COPY, STEPS } from '@/content/landing';
import './HowItWorks.css';

const { title, subtitle } = SECTION_COPY.how;

const HowItWorks = () => (
  <section className="landing-section how-it-works" id="how" data-wash="cyan">
    <h2 className="section-title" data-reveal="up">{title}</h2>
    <p className="section-subtitle" data-reveal="up">{subtitle}</p>
    <ol className="track" aria-label="How it works" data-reveal="fade" data-reveal-stagger="140">
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
