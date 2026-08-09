'use client';

import Image from 'next/image';

import { HERO } from '@/content/landing';
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
    <span className="aurora" aria-hidden="true" />

    <div className="copy" data-reveal-stagger="90">
      <span className="eyebrow" data-reveal="down">{HERO.eyebrow}</span>
      <h1 data-reveal="up">
        {HERO.titleLead}
        <br />
        <span className="title-accent">{HERO.titleAccent}</span>
      </h1>
      <p data-reveal="up">{HERO.body}</p>
      <div className="actions" data-reveal="up">
        <NeonButton className="primary-cta" type="button" tone="emerald" onClick={openApp}>
          {HERO.primaryCta}
        </NeonButton>
        <a href="#features" className="neon-btn tone-azure size-md secondary-cta">
          <span className="label">{HERO.secondaryCta}</span>
        </a>
      </div>
    </div>

    <a href="#features" className="scroll-hint" aria-label={HERO.scrollLabel}>
      <span />
    </a>
  </section>
);

export default Hero;
