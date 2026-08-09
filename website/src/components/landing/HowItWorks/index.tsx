'use client';

import { SECTION_COPY, STEPS } from '@/content/landing';
import usePointerTilt from '@/hooks/usePointerTilt';
import './HowItWorks.css';

const { title, subtitle } = SECTION_COPY.how;

const HowItWorks = () => {
  const stageRef = usePointerTilt<HTMLDivElement>();

  return (
    <section className="landing-section how-it-works" id="how" data-wash="cyan">
      <h2 className="section-title" data-reveal="up">{title}</h2>
      <p className="section-subtitle" data-reveal="up">{subtitle}</p>

      <div className="stage" ref={stageRef}>
        {/* One 3D world: the conduit and the slabs share a coordinate space, so
            the beam genuinely passes behind the cards rather than being drawn
            over a flat backdrop. */}
        <div className="world" data-reveal="fade">
          <span className="conduit" aria-hidden="true" />

          <ol className="steps" data-reveal-stagger="150">
            {STEPS.map(({ number, title: stepTitle, text }) => (
              <li className="step" key={number} data-reveal="rise">
                <div className="slab">
                  {/* Side faces give the slab thickness. Both are rendered and
                      backface-visibility hides whichever is turned away, so the
                      wall's left and right halves each show their outer edge
                      without per-card configuration. */}
                  <span className="edge edge-l" aria-hidden="true" />
                  <span className="edge edge-r" aria-hidden="true" />

                  <div className="face">
                    <span className="token" aria-hidden="true">
                      <span className="token-face">{number}</span>
                    </span>
                    <h3>{stepTitle}</h3>
                    <p>{text}</p>
                  </div>

                  <span className="pool" aria-hidden="true" />
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
