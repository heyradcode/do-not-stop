'use client';

import Image from 'next/image';

import { openApp } from '@/lib/openApp';
import { NeonButton } from '../../common';
import heroBackground from '../../../../public/images/background.png';
import './Hero.css';

const Hero = () => (
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
    <div className="copy" data-reveal-stagger="90">
      <span className="eyebrow" data-reveal="down">On-Chain Pet Adventure</span>
      <h2 data-reveal="up">
        Collect, Battle &amp; Breed
        <br />
        <span className="title-accent">Your Dream Pets</span>
      </h2>
      <p data-reveal="up">10,000+ handcrafted neon companions, fully owned by you. Hatch them, train them, send them into the arena.</p>
      <div className="actions" data-reveal="up">
        <NeonButton type="button" tone="emerald" onClick={openApp}>
          Play Now
        </NeonButton>
        <a href="#features" className="neon-btn tone-azure size-md secondary-cta">
          <span className="label">Explore Features</span>
        </a>
      </div>
    </div>
    <a href="#features" className="scroll-hint" aria-label="Scroll to features">
      <span />
    </a>
  </section>
);

export default Hero;
