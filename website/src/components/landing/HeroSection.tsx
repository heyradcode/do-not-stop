import { NeonButton } from '../common';
import './HeroSection.css';

type HeroSectionProps = {
  onStartPlaying: () => void;
};

export default function HeroSection({ onStartPlaying }: HeroSectionProps) {
  return (
    <section className="landing-hero">
      <div className="hero-copy">
        <h2>Collect, Battle &amp; Breed Your Dream Pets!</h2>
        <p>10K+ handcrafted digital pets in the ultimate on-chain adventure.</p>
        <div className="hero-actions">
          <NeonButton type="button" tone="emerald" onClick={onStartPlaying}>
            Start Playing
          </NeonButton>
          <NeonButton tone="azure">Watch Trailer</NeonButton>
        </div>
      </div>
    </section>
  );
}
