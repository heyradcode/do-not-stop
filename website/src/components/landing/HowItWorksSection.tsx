import { LANDING_STEPS } from '../../constants/landingContent';
import './HowItWorksSection.css';

export default function HowItWorksSection() {
  return (
    <section className="landing-section how-it-works" id="how">
      <h3 className="section-title">How It Works</h3>
      <p className="section-subtitle">From wallet to first win in four short steps.</p>
      <ol className="step-track" aria-label="How it works">
        {LANDING_STEPS.map((step) => (
          <li className="step-node" key={step.number}>
            <span className="step-node-circle" aria-hidden="true">
              <span>{step.number}</span>
            </span>
            <h4>{step.title}</h4>
            <p>{step.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
