import { FAQS } from '@/content/landing';
import './Faq.css';

const Faq = () => (
  <section className="landing-section faq" id="faq" data-wash="magenta">
    <h3 className="section-title" data-reveal="up">Questions, Answered</h3>
    <p className="section-subtitle" data-reveal="up">Everything you need to know before you mint your first pet.</p>
    <div className="list" data-reveal-stagger="55">
      {FAQS.map(({ question, answer }, idx) => (
        <details className="item" key={question} open={idx === 0} data-reveal="up">
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
