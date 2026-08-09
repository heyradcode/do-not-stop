'use client';

import { openApp } from '@/lib/openApp';
import { NeonButton } from '../../common';
import './Cta.css';

const Cta = () => (
  <section className="cta" aria-label="Get started">
    <div className="inner" data-reveal="scale">
      <div>
        <span className="eyebrow">Next Drop · Live Soon</span>
        <h3>Don&apos;t miss the next mint.</h3>
        <p>Connect your wallet now and claim your spot on the whitelist.</p>
      </div>
      <NeonButton type="button" tone="emerald" onClick={openApp}>
        Connect Wallet
      </NeonButton>
    </div>
  </section>
);

export default Cta;
