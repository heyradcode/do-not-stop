'use client';

import Layout from '../components/layout/Layout';
import {
  CommunitySection,
  FeatureInteractionsSection,
  FeaturedPetsSection,
  FooterSection,
  HeroSection,
  StatsBandSection,
} from '../components/landing';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:5173';

export default function LandingPage() {
  const handleStartPlaying = () => {
    window.location.href = APP_URL;
  };

  return (
    <Layout containerClassName="landing-layout">
      <div className="landing">
        <HeroSection onStartPlaying={handleStartPlaying} />
        <FeatureInteractionsSection />
        <FeaturedPetsSection />
        <StatsBandSection />
        <CommunitySection />
        <FooterSection />
      </div>
    </Layout>
  );
}
