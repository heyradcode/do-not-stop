import Image from 'next/image';

import { PETS, RARITY_TIERS } from '@/content/landing';
import { NeonCard } from '../../common';
import './Pets.css';

const rarityMod = (rarity: string) => rarity.toLowerCase();

const Pets = () => (
  <section className="landing-section pets" id="pets">
    <h3 className="section-title" data-reveal="up">Meet the Companions</h3>
    <p className="section-subtitle" data-reveal="up">Four rarity tiers, ten thousand creatures, one shot at the legendary roster.</p>

    <div className="rarity" aria-label="Rarity tier distribution" data-reveal="fade">
      <div className="rarity-track">
        {RARITY_TIERS.map(({ name, share, tone }) => (
          <div
            key={name}
            className={`rarity-segment tone-${tone}`}
            style={{ flexBasis: share }}
            title={`${name} · ${share}`}
          />
        ))}
      </div>
      <ul className="rarity-legend">
        {RARITY_TIERS.map(({ name, share, blurb, tone }) => (
          <li key={name} className={`tone-${tone}`}>
            <span className="dot" aria-hidden="true" />
            <div>
              <strong>{name}</strong>
              <span className="share">{share}</span>
              <p>{blurb}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>

    <div className="grid" data-reveal-stagger="60">
      {PETS.map(({ name, level, rarity, image }) => (
        <NeonCard key={name} className={`card r-${rarityMod(rarity)}`} data-reveal="rise">
          <div className="avatar">
            <Image src={image} alt={name} width={78} height={78} />
          </div>
          <h4>{name}</h4>
          <div className="meta">
            <span className="level">Lv. {level}</span>
            <span className={`tag r-${rarityMod(rarity)}`}>{rarity}</span>
          </div>
        </NeonCard>
      ))}
    </div>
  </section>
);

export default Pets;
