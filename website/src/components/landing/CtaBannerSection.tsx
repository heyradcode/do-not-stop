import { NeonButton } from '../common';
import './CtaBannerSection.css';

type CtaBannerSectionProps = {
  onStartPlaying: () => void;
};

export default function CtaBannerSection({ onStartPlaying }: CtaBannerSectionProps) {
  return (
    <section className="cta-banner" aria-label="Get started">
      <div className="cta-banner-inner">
        <div>
          <span className="cta-banner-eyebrow">Next Drop · Live Soon</span>
          <h3>Don&apos;t miss the next mint.</h3>
          <p>Connect your wallet now and claim your spot on the whitelist.</p>
        </div>
        <NeonButton type="button" tone="emerald" onClick={onStartPlaying}>
          Connect Wallet
        </NeonButton>
      </div>
    </section>
  );
}
