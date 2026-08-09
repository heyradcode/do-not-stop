import { FAQS, SECTION_COPY } from '@/content/landing';
import './Faq.css';

const { title, subtitle } = SECTION_COPY.faq;

/**
 * A shared `name` makes the group an exclusive accordion: opening one item
 * closes the rest, natively. No JS, so the section stays a server component and
 * keeps working with the bundle blocked. Where `name` is unsupported the items
 * stay independent — the previous behaviour, not a broken one.
 */
const GROUP = 'faq';

const Faq = () => (
  <section className="landing-section faq" id="faq" data-wash="magenta">
    <h2 className="section-title" data-reveal="up">{title}</h2>
    <p className="section-subtitle" data-reveal="up">{subtitle}</p>
    <div className="list" data-reveal-stagger="55">
      {FAQS.map(({ question, answer }, idx) => (
        <details className="item" key={question} name={GROUP} open={idx === 0} data-reveal="up">
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
