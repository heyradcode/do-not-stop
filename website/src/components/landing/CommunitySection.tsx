import { LANDING_COMMUNITY_CARDS } from '../../constants/landingContent';
import CommunityIcon from './CommunityIcon';
import './CommunitySection.css';

export default function CommunitySection() {
  return (
    <section className="landing-section community" id="community">
      <div className="community-block">
        <div className="community-copy">
          <h3 className="section-title">Join the Pack</h3>
          <p className="section-subtitle">Strategy threads, alpha drops, and degen chatter — pick your channel.</p>
        </div>
        <ul className="community-chips">
          {LANDING_COMMUNITY_CARDS.map((community) => (
            <li key={community.name}>
              <a
                href={community.href ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className={`community-chip ${community.color}`}
              >
                <span className="chip-icon" aria-hidden="true">
                  <CommunityIcon brand={community.color} />
                </span>
                <span className="chip-text">
                  <strong>{community.name}</strong>
                  <span>{community.members}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
