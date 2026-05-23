import { FAQS } from '@/content/landing';
import './Faq.css';

const Faq = () => (
  <section className="landing-section faq" id="faq">
    <h3 className="section-title">Questions, Answered</h3>
    <p className="section-subtitle">Everything you need to know before you mint your first pet.</p>
    <div className="list">
      {FAQS.map(({ question, answer }, idx) => (
        <details className="item" key={question} open={idx === 0}>
          <summary>
            <span>{question}</span>
            <span className="chevron" aria-hidden="true" />
          </summary>
          <p>{answer}</p>
        </details>
      ))}
    </div>
  </section>
);

export default Faq;
