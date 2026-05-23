import { NeonButton, NeonCard } from '../common';
import { LANDING_FEATURED_PETS } from '../../constants/landingContent';
import './FeaturedPetsSection.css';

export default function FeaturedPetsSection() {
  return (
    <section className="landing-section featured-pets">
      <h3 className="section-title">PETS</h3>
      <div className="pet-showcase-grid">
        {LANDING_FEATURED_PETS.map((pet) => (
          <NeonCard key={pet.name} className="pet-showcase-card">
            <div className="pet-avatar">
              <img src={pet.image} alt={pet.name} className="pet-avatar-image" />
            </div>
            <h4>{pet.name}</h4>
            <p>
              Lv. {pet.level} {pet.rarity}
            </p>
            <NeonButton tone="amber" size="sm">
              Send
            </NeonButton>
          </NeonCard>
        ))}
      </div>
    </section>
  );
}
