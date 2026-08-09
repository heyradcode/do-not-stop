import Image from 'next/image';

import { FEATURES } from '@/content/landing';
import { NeonCard } from '../../common';
import './Features.css';

const Features = () => (
  <section className="landing-section features" id="features" data-wash="violet">
    <h3 className="section-title" data-reveal="up">What You Can Do</h3>
    <p className="section-subtitle" data-reveal="up">Every pet is a fully on-chain asset — yours to grow, fight, and trade.</p>
    <div className="grid" data-reveal-stagger>
      {FEATURES.map(({ title, text, iconImage }) => (
        <NeonCard key={title} className="card" data-reveal="rise">
          <div className="icon" aria-hidden="true">
            {iconImage && <Image src={iconImage} alt="" width={96} height={96} />}
          </div>
          <div className="copy">
            <h4>{title}</h4>
            <p>{text}</p>
          </div>
        </NeonCard>
      ))}
    </div>
  </section>
);

export default Features;
