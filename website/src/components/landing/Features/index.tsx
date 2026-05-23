import { FEATURES } from '@/content/landing';
import { NeonCard } from '../../common';
import './Features.css';

const Features = () => (
  <section className="landing-section features" id="features">
    <h3 className="section-title">What You Can Do</h3>
    <p className="section-subtitle">Every pet is a fully on-chain asset — yours to grow, fight, and trade.</p>
    <div className="grid">
      {FEATURES.map(({ title, text, iconImage }) => (
        <NeonCard key={title} className="card">
          <div className="icon" aria-hidden="true">
            {iconImage && <img src={iconImage} alt="" />}
          </div>
          <div className="copy">
            <h4>{title}</h4>
            <p>{text}</p>
          </div>
        </NeonCard>
      ))}
    </div>
  </section>
);

export default Features;
