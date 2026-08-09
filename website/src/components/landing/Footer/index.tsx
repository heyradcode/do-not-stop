import { FOOTER, NAV_LINKS, RESOURCE_LINKS } from '@/content/landing';
import './Footer.css';

const Footer = () => (
  <footer className="footer">
    <div className="grid" data-reveal-stagger>
      <div className="brand" data-reveal="up">
        <h2>{FOOTER.brand}</h2>
        <p>{FOOTER.blurb}</p>
      </div>
      <nav className="col" aria-label="Sections" data-reveal="up">
        <h3>{FOOTER.exploreHeading}</h3>
        <ul>
          {NAV_LINKS.map(({ label, href }) => (
            <li key={label}>
              <a href={href}>{label}</a>
            </li>
          ))}
        </ul>
      </nav>
      <nav className="col" aria-label="Resources" data-reveal="up">
        <h3>{FOOTER.resourcesHeading}</h3>
        <ul>
          {RESOURCE_LINKS.map(({ label, href, external }) => (
            <li key={label}>
              <a
                href={href}
                {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
    <div className="bottom">
      <span>
        © {new Date().getFullYear()} {FOOTER.copyrightHolder}. {FOOTER.rights}
      </span>
      <span className="tag">{FOOTER.tag}</span>
    </div>
  </footer>
);

export default Footer;
