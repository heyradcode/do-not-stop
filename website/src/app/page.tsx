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
  Roadmap,
  Stats,
  Testimonials,
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
      <Testimonials />
      <Faq />
      <Backers />
      <Community />
      <Footer />
    </div>
  </Layout>
);

export default LandingPage;
