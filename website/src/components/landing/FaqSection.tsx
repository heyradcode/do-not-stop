import { LANDING_FAQS } from '../../constants/landingContent';
import './FaqSection.css';

export default function FaqSection() {
  return (
    <section className="landing-section faq" id="faq">
      <h3 className="section-title">Questions, Answered</h3>
      <p className="section-subtitle">Everything you need to know before you mint your first pet.</p>
      <div className="faq-list">
        {LANDING_FAQS.map((item, idx) => (
          <details className="faq-item" key={item.question} open={idx === 0}>
            <summary>
              <span>{item.question}</span>
              <span className="faq-chevron" aria-hidden="true" />
            </summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
