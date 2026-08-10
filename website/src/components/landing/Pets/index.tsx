'use client';

import { useCallback, useRef, type CSSProperties } from 'react';
import Image from 'next/image';

import { PETS, RARITY_TIERS, SECTION_COPY } from '@/content/landing';
import useScrollScene from '@/hooks/useScrollScene';
import './Pets.css';

const rarityMod = (rarity: string) => rarity.toLowerCase();

const { title, subtitle } = SECTION_COPY.pets;

const COUNT = PETS.length;
const STEP = 360 / COUNT;
/** Rotation over the scene: enough to bring every pet to the front once. */
const SWEEP = (COUNT - 1) * STEP;
/** Below this the carousel unpins and flattens to a grid — see Pets.css. */
const FLAT_QUERY = '(max-width: 900px)';

const Pets = () => {
  const cards = useRef<(HTMLElement | null)[]>([]);
  const dots = useRef<(HTMLElement | null)[]>([]);

  const onFrame = useCallback((progress: number) => {
    // Distance from the front of the ring, in card slots, wrapped the short way
    // round. Published per card as a continuous value so dimming and blur fall
    // off smoothly instead of snapping between discrete states.
    const front = progress * (COUNT - 1);
    const nearest = Math.round(front);

    cards.current.forEach((el, index) => {
      if (!el) return;
      let offset = index - front;
      if (offset > COUNT / 2) offset -= COUNT;
      if (offset < -COUNT / 2) offset += COUNT;

      const distance = Math.abs(offset);
      el.style.setProperty('--dist', distance.toFixed(3));
      el.toggleAttribute('data-front', distance < 0.5);
    });

    dots.current.forEach((el, index) => {
      el?.toggleAttribute('data-on', index === nearest);
    });
  }, []);

  const { sectionRef, pinRef } = useScrollScene<HTMLDivElement, HTMLDivElement>(onFrame, {
    fallbackQuery: FLAT_QUERY,
    // A carousel handed its finished state would sit on the last pet.
    fallbackValue: 0,
  });

  return (
    <section className="landing-section pets" id="pets" data-wash="magenta">
      {/* Pinned so the heading stays with the roster it introduces — unpinned,
          a stage this tall scrolls its own title off the screen. */}
      <div
        className="showcase"
        ref={sectionRef}
        style={{ '--pet-count': COUNT } as CSSProperties}
      >
        <div className="pin" ref={pinRef}>
          <header className="intro">
            <h2 className="section-title">{title}</h2>
            <p className="section-subtitle">{subtitle}</p>
          </header>

          <div className="carousel" style={{ '--sweep': `${SWEEP}deg` } as CSSProperties}>
            <span className="floor" aria-hidden="true" />

            <ul className="ring">
              {PETS.map(({ name, level, rarity, image }, index) => (
                <li
                  key={name}
                  className={`slot r-${rarityMod(rarity)}`}
                  style={{ '--angle': `${index * STEP}deg` } as CSSProperties}
                  ref={(el) => {
                    cards.current[index] = el;
                  }}
                >
                  <article className="pet-card">
                    <div className="art">
                      <Image
                        src={image}
                        alt={name}
                        width={512}
                        height={512}
                        sizes="(max-width: 900px) 44vw, 300px"
                      />
                      <span className="sheen" aria-hidden="true" />
                    </div>
                    <h3>{name}</h3>
                    <div className="meta">
                      <span className="level">Lv. {level}</span>
                      <span className={`tag r-${rarityMod(rarity)}`}>{rarity}</span>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          </div>

          <ol className="dots" aria-hidden="true">
            {PETS.map(({ name }, index) => (
              <li
                key={name}
                data-on={index === 0 ? '' : undefined}
                ref={(el) => {
                  dots.current[index] = el;
                }}
              />
            ))}
          </ol>

          {/* Anchored to the foot of the pin: it stays on screen for the whole
              scene, but sits below the roster rather than between the heading
              and the thing the heading introduces. */}
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
        </div>
      </div>

    </section>
  );
};

export default Pets;
