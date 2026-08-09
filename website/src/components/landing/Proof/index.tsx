import { PROOF_POINTS, SECTION_COPY } from '@/content/landing';
import './Proof.css';

const { title, subtitle } = SECTION_COPY.proof;

const Proof = () => (
  <section className="landing-section proof" id="proof" data-wash="violet">
    <h2 className="section-title" data-reveal="up">{title}</h2>
    <p className="section-subtitle" data-reveal="up">{subtitle}</p>
    <ol className="grid" data-reveal-stagger="110">
      {PROOF_POINTS.map(({ step, title: pointTitle, text }) => (
        <li className="card" key={step} data-reveal="rise">
          <span className="step" aria-hidden="true">{step}</span>
          <h3>{pointTitle}</h3>
          <p>{text}</p>
        </li>
      ))}
    </ol>
  </section>
);

export default Proof;
