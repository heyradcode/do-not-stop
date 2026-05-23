import { NeonButton, NeonCard } from '../common';
import { LANDING_COMMUNITY_CARDS } from '../../constants/landingContent';
import CommunityIcon from './CommunityIcon';
import './CommunitySection.css';

export default function CommunitySection() {
  return (
    <section className="landing-section">
      <h3 className="section-title">Join Our Community</h3>
      <div className="community-grid">
        {LANDING_COMMUNITY_CARDS.map((community) => (
          <NeonCard key={community.name} className={`community-card ${community.color}`}>
            <div className="community-icon" aria-hidden="true">
              <CommunityIcon brand={community.color} />
            </div>
            <h4>{community.name}</h4>
            <p>{community.members}</p>
            <NeonButton tone="cyan" size="sm">
              Join Now
            </NeonButton>
          </NeonCard>
        ))}
      </div>
    </section>
  );
}
