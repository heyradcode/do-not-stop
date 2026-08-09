import Layout from '@/components/layout/Layout';
import {
  Backers,
  Community,
  Cta,
  Faq,
  Features,
  Footer,
  Hero,
  HowItWorks,
  Pets,
  Proof,
  Roadmap,
  Stats,
} from '@/components/landing';

const LandingPage = () => (
  <Layout containerClassName="landing-layout">
    <div className="landing">
      <Hero />
      <HowItWorks />
      <Features />
      <Pets />
      <Stats />
      <Cta />
      <Roadmap />
      <Proof />
      <Faq />
      <Backers />
      <Community />
      <Footer />
    </div>
  </Layout>
);

export default LandingPage;
