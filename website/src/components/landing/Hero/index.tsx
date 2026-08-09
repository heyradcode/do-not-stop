'use client';

import Image from 'next/image';

import { PETS } from '@/content/landing';
import usePointerParallax from '@/hooks/usePointerParallax';
import { openApp } from '@/lib/openApp';
import { NeonButton } from '../../common';
import heroBackground from '../../../../public/images/background.png';
import './Hero.css';

const [featured] = PETS;

const Hero = () => {
  const showcaseRef = usePointerParallax<HTMLDivElement>();

  return (
    <section className="hero" id="top">
      <Image
        className="hero-bg"
        src={heroBackground}
        alt=""
        fill
        priority
        placeholder="blur"
        sizes="100vw"
      />
      <span className="aurora" aria-hidden="true" />

      <div className="inner">
        <div className="copy" data-reveal-stagger="90">
          <span className="eyebrow" data-reveal="down">On-Chain Pet Adventure</span>
          <h1 data-reveal="up">
            Collect, Battle &amp; Breed
            <br />
            <span className="title-accent">Your Dream Pets</span>
          </h1>
          <p data-reveal="up">10,000+ handcrafted neon companions, fully owned by you. Hatch them, train them, send them into the arena.</p>
          <div className="actions" data-reveal="up">
            <NeonButton className="primary-cta" type="button" tone="emerald" onClick={openApp}>
              Play Now
            </NeonButton>
            <a href="#features" className="neon-btn tone-azure size-md secondary-cta">
              <span className="label">Explore Features</span>
            </a>
          </div>
        </div>

        <div className="showcase" ref={showcaseRef} data-reveal="scale">
          <div className="stage">
            <span className="halo" aria-hidden="true" />
            <span className="pedestal" aria-hidden="true" />
            <Image
              className="pet"
              src={featured.image}
              alt={featured.name}
              width={500}
              height={500}
              priority
            />
            <span className="badge" data-rarity={featured.rarity.toLowerCase()}>
              {featured.rarity}
            </span>
          </div>
        </div>
      </div>

      <a href="#features" className="scroll-hint" aria-label="Scroll to features">
        <span />
      </a>
    </section>
  );
};

export default Hero;
