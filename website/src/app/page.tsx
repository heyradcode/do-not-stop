'use client';

import Layout from '../components/layout/Layout';
import {
  BackersSection,
  CommunitySection,
  CtaBannerSection,
  FaqSection,
  FeatureInteractionsSection,
  FeaturedPetsSection,
  FooterSection,
  HeroSection,
  HowItWorksSection,
  RoadmapSection,
  StatsBandSection,
  TestimonialsSection,
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
        <HowItWorksSection />
        <FeatureInteractionsSection />
        <FeaturedPetsSection />
        <StatsBandSection />
        <CtaBannerSection onStartPlaying={handleStartPlaying} />
        <RoadmapSection />
        <TestimonialsSection />
        <FaqSection />
        <BackersSection />
        <CommunitySection />
        <FooterSection />
      </div>
    </Layout>
  );
}
