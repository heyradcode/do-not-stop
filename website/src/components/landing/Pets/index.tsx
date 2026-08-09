import type { CSSProperties } from 'react';
import Image from 'next/image';

import { PETS, RARITY_TIERS, SECTION_COPY } from '@/content/landing';
import { NeonCard } from '../../common';
import './Pets.css';

const rarityMod = (rarity: string) => rarity.toLowerCase();

const { title, subtitle } = SECTION_COPY.pets;

const Pets = () => (
  <section className="landing-section pets" id="pets" data-wash="magenta">
    <h2 className="section-title" data-reveal="up">{title}</h2>
    <p className="section-subtitle" data-reveal="up">{subtitle}</p>

    <div className="rarity" aria-label="Rarity tier distribution" data-reveal="fade">
      <div className="rarity-track">
        {RARITY_TIERS.map(({ name, share, tone }, index) => (
          <div
            key={name}
            className={`rarity-segment tone-${tone}`}
            style={{ '--share': share, '--seg-delay': `${index * 110}ms` } as CSSProperties}
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

    <div className="grid" data-reveal-stagger="70">
      {PETS.map(({ name, level, rarity, image }) => (
        <NeonCard key={name} className={`card r-${rarityMod(rarity)}`} data-reveal="rise">
          <span className="sheen" aria-hidden="true" />
          <div className="avatar">
            <Image src={image} alt={name} width={220} height={220} />
          </div>
          <h3>{name}</h3>
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
