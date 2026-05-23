import './FooterSection.css';

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

export default function FooterSection() {
  return (
    <footer className="landing-footer">
      <div className="footer-grid">
        <div className="footer-brand">
          <h4>CryptoPet</h4>
          <p>Build your dream pet roster, rule the arena, and trade legendary companions.</p>
        </div>
        <nav className="footer-col" aria-label="Sections">
          <h5>Explore</h5>
          <ul>
            {NAV_LINKS.map((link) => (
              <li key={link.label}>
                <a href={link.href}>{link.label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <nav className="footer-col" aria-label="Resources">
          <h5>Resources</h5>
          <ul>
            {META_LINKS.map((link) => (
              <li key={link.label}>
                <a href={link.href}>{link.label}</a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} CryptoPet. All rights reserved.</span>
        <span className="footer-tag">Built on-chain.</span>
      </div>
    </footer>
  );
}
