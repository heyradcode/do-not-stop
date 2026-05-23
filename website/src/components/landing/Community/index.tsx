import { COMMUNITIES } from '@/content/landing';
import Icon from './Icon';
import './Community.css';

const Community = () => (
  <section className="landing-section community" id="community">
    <div className="block">
      <div className="copy">
        <h3 className="section-title">Join the Pack</h3>
        <p className="section-subtitle">Strategy threads, alpha drops, and degen chatter — pick your channel.</p>
      </div>
      <ul className="chips">
        {COMMUNITIES.map(({ name, members, color, href }) => (
          <li key={name}>
            <a href={href ?? '#'} target="_blank" rel="noopener noreferrer" className={`chip ${color}`}>
              <span className="chip-icon" aria-hidden="true">
                <Icon brand={color} />
              </span>
              <span className="chip-text">
                <strong>{name}</strong>
                <span>{members}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  </section>
);

export default Community;
