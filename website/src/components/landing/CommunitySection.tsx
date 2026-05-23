import { NeonCard } from '../common';
import { LANDING_COMMUNITY_CARDS } from '../../constants/landingContent';
import CommunityIcon from './CommunityIcon';
import './CommunitySection.css';



export default function CommunitySection() {
  return (
    <section className="landing-section" id="community">
      <h3 className="section-title">Join Our Community</h3>
      <p className="section-subtitle">Strategy, drops and degen chatter — pick your channel.</p>
      <div className="community-grid">
        {LANDING_COMMUNITY_CARDS.map((community) => (
          <NeonCard key={community.name} className={`community-card ${community.color}`}>
            <div className="community-icon" aria-hidden="true">
              <CommunityIcon brand={community.color} />
            </div>
            <h4>{community.name}</h4>
            <p>{community.members}</p>
            <a
              href={community.href ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="neon-btn tone-cyan size-sm community-cta"
            >
              <span className="label">Join Now</span>
            </a>
          </NeonCard>
        ))}
      </div>
    </section>
  );
}
