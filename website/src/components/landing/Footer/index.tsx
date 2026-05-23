import './Footer.css';

const NAV_LINKS = [
  { label: 'How It Works', href: '#how' },
  { label: 'Features', href: '#features' },
  { label: 'Pets', href: '#pets' },
  { label: 'Roadmap', href: '#roadmap' },
  { label: 'FAQ', href: '#faq' },
  { label: 'Community', href: '#community' },
];

const META_LINKS = [
  { label: 'About', href: '#' },
  { label: 'Roadmap', href: '#' },
  { label: 'Docs', href: '#' },
  { label: 'Support', href: '#' },
];

const Footer = () => (
  <footer className="footer">
    <div className="grid">
      <div className="brand">
        <h4>CryptoPet</h4>
        <p>Build your dream pet roster, rule the arena, and trade legendary companions.</p>
      </div>
      <nav className="col" aria-label="Sections">
        <h5>Explore</h5>
        <ul>
          {NAV_LINKS.map(({ label, href }) => (
            <li key={label}>
              <a href={href}>{label}</a>
            </li>
          ))}
        </ul>
      </nav>
      <nav className="col" aria-label="Resources">
        <h5>Resources</h5>
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
