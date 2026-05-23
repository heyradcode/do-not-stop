import { NeonCard } from '../common';
import { LANDING_FEATURED_PETS, LANDING_RARITY_TIERS } from '../../constants/landingContent';
import './FeaturedPetsSection.css';

const rarityClass = (rarity: string) => `rarity-${rarity.toLowerCase()}`;

export default function FeaturedPetsSection() {
  return (
    <section className="landing-section featured-pets" id="pets">
      <h3 className="section-title">Meet the Companions</h3>
      <p className="section-subtitle">Four rarity tiers, ten thousand creatures, one shot at the legendary roster.</p>

      <div className="rarity-tiers">
        {LANDING_RARITY_TIERS.map((tier) => (
          <div className={`rarity-tier tone-${tier.tone}`} key={tier.name}>
            <div className="rarity-tier-head">
              <span className="rarity-tier-name">{tier.name}</span>
              <span className="rarity-tier-share">{tier.share}</span>
            </div>
            <p>{tier.blurb}</p>
            <div className="rarity-bar" aria-hidden="true">
              <span style={{ width: tier.share }} />
            </div>
          </div>
        ))}
      </div>

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
