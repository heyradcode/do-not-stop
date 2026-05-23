import { NeonCard } from '../common';
import { LANDING_FEATURE_CARDS } from '../../constants/landingContent';
import './FeatureInteractionsSection.css';

export default function FeatureInteractionsSection() {
  return (
    <section className="landing-section" id="features">
      <h3 className="section-title">What You Can Do</h3>
      <p className="section-subtitle">Every pet is a fully on-chain asset — yours to grow, fight, and trade.</p>
      <div className="feature-grid">
        {LANDING_FEATURE_CARDS.map((feature) => (
          <NeonCard key={feature.title} className="feature-card feature-card-media-left">
            <div className="feature-icon" aria-hidden="true">
              {feature.iconImage ? (
                <img src={feature.iconImage} alt="" className="feature-icon-image" />
              ) : (
                feature.icon
              )}
            </div>
            <div className="feature-copy">
              <h4>{feature.title}</h4>
              <p>{feature.text}</p>
            </div>
          </NeonCard>
        ))}
      </div>
    </section>
  );
}
