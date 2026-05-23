import './FooterSection.css';

export default function FooterSection() {
  return (
    <footer className="landing-footer">
      <div className="footer-brand">
        <h4>CryptoPet</h4>
        <p>Build your dream pet roster, rule the arena, and trade legendary companions.</p>
      </div>
      <div className="footer-links">
        <a href="#" onClick={(e) => e.preventDefault()}>
          About
        </a>
        <a href="#" onClick={(e) => e.preventDefault()}>
          Roadmap
        </a>
        <a href="#" onClick={(e) => e.preventDefault()}>
          Docs
        </a>
        <a href="#" onClick={(e) => e.preventDefault()}>
          Support
        </a>
      </div>
    </footer>
  );
}
