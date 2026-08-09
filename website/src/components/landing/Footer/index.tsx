import { NAV_LINKS } from '@/content/landing';
import './Footer.css';

const META_LINKS = [
  { label: 'About', href: '#' },
  { label: 'Roadmap', href: '#' },
  { label: 'Docs', href: '#' },
  { label: 'Support', href: '#' },
];

const Footer = () => (
  <footer className="footer">
    <div className="grid" data-reveal-stagger>
      <div className="brand" data-reveal="up">
        <h2>CryptoPet</h2>
        <p>Build your dream pet roster, rule the arena, and trade legendary companions.</p>
      </div>
      <nav className="col" aria-label="Sections" data-reveal="up">
        <h3>Explore</h3>
        <ul>
          {NAV_LINKS.map(({ label, href }) => (
            <li key={label}>
              <a href={href}>{label}</a>
            </li>
          ))}
        </ul>
      </nav>
      <nav className="col" aria-label="Resources" data-reveal="up">
        <h3>Resources</h3>
        <ul>
          {META_LINKS.map(({ label, href }) => (
            <li key={label}>
              <a href={href}>{label}</a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
    <div className="bottom">
      <span>© {new Date().getFullYear()} CryptoPet. All rights reserved.</span>
      <span className="tag">Built on-chain.</span>
    </div>
  </footer>
);

export default Footer;
