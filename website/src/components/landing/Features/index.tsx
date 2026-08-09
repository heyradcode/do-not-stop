import Image from 'next/image';

import { FEATURES, SECTION_COPY } from '@/content/landing';
import { NeonCard, SpotlightGroup } from '../../common';
import './Features.css';

const { title: sectionTitle, subtitle } = SECTION_COPY.features;

/** Bento rhythm: the first and last cards run wide, the middle pair narrow. */
const isWide = (index: number) => index === 0 || index === FEATURES.length - 1;

const Features = () => (
  <section className="landing-section features" id="features" data-wash="violet">
    <h2 className="section-title" data-reveal="up">{sectionTitle}</h2>
    <p className="section-subtitle" data-reveal="up">{subtitle}</p>
    <SpotlightGroup className="grid" data-reveal-stagger="90">
      {FEATURES.map(({ title, text, iconImage }, index) => (
        <NeonCard
          key={title}
          className="card"
          data-span={isWide(index) ? 'wide' : 'narrow'}
          data-spotlight
          data-reveal="rise"
        >
          <span className="spot" aria-hidden="true" />
          <div className="icon" aria-hidden="true">
            {iconImage && <Image src={iconImage} alt="" width={96} height={96} />}
          </div>
          <div className="copy">
            <h3>{title}</h3>
            <p>{text}</p>
          </div>
        </NeonCard>
      ))}
    </SpotlightGroup>
  </section>
);

export default Features;
