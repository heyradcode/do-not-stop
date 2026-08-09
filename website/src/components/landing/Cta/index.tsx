'use client';

import { CTA_BAND } from '@/content/landing';
import { openApp } from '@/lib/openApp';
import { NeonButton } from '../../common';
import './Cta.css';

const Cta = () => (
  <section className="cta" aria-label="Get started">
    <div className="inner" data-reveal="scale">
      <div>
        <span className="eyebrow">{CTA_BAND.eyebrow}</span>
        <h2>{CTA_BAND.title}</h2>
        <p>{CTA_BAND.body}</p>
      </div>
      <NeonButton type="button" tone="emerald" onClick={openApp}>
        {CTA_BAND.action}
      </NeonButton>
    </div>
  </section>
);

export default Cta;
