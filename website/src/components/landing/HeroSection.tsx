import { NeonButton } from '../common';
import './HeroSection.css';

type HeroSectionProps = {
  onStartPlaying: () => void;
};

export default function HeroSection({ onStartPlaying }: HeroSectionProps) {
  return (
    <section className="landing-hero" id="top">
      <div className="hero-copy">
        <span className="hero-eyebrow">On-Chain Pet Adventure</span>
        <h2>
          Collect, Battle &amp; Breed
          <br />
          <span className="hero-title-accent">Your Dream Pets</span>
        </h2>
        <p>10,000+ handcrafted neon companions, fully owned by you. Hatch them, train them, send them into the arena.</p>
        <div className="hero-actions">
          <NeonButton type="button" tone="emerald" onClick={onStartPlaying}>
            Play Now
          </NeonButton>
          <a href="#features" className="neon-btn tone-azure size-md hero-secondary-cta">
            <span className="label">Explore Features</span>
          </a>
        </div>
      </div>
      <a href="#features" className="hero-scroll-hint" aria-label="Scroll to features">
        <span />
      </a>
    </section>
  );
}
