import { NeonCard } from '../common';
import { LANDING_FEATURED_PETS } from '../../constants/landingContent';
import './FeaturedPetsSection.css';

const rarityClass = (rarity: string) => `rarity-${rarity.toLowerCase()}`;

export default function FeaturedPetsSection() {
  return (
    <section className="landing-section featured-pets" id="pets">
      <h3 className="section-title">Meet the Companions</h3>
      <p className="section-subtitle">A glimpse of the rarest pets currently roaming the network.</p>
      <div className="pet-showcase-grid">
        {LANDING_FEATURED_PETS.map((pet) => (
          <NeonCard key={pet.name} className={`pet-showcase-card ${rarityClass(pet.rarity)}`}>
            <div className="pet-avatar">
              <img src={pet.image} alt={pet.name} className="pet-avatar-image" />
            </div>
            <h4>{pet.name}</h4>
            <div className="pet-meta">
              <span className="pet-level">Lv. {pet.level}</span>
              <span className={`pet-rarity ${rarityClass(pet.rarity)}`}>{pet.rarity}</span>
            </div>
          </NeonCard>
        ))}
      </div>
    </section>
  );
}
