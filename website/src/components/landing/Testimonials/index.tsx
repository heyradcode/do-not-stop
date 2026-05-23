import { TESTIMONIALS } from '@/content/landing';
import './Testimonials.css';

const Testimonials = () => (
  <section className="landing-section testimonials" id="players">
    <h3 className="section-title">From the Pack</h3>
    <p className="section-subtitle">What players are saying after their first 100 battles.</p>
    <div className="grid">
      {TESTIMONIALS.map(({ quote, author, role }) => (
        <figure className="card" key={author}>
          <span className="quote-mark" aria-hidden="true">&ldquo;</span>
          <blockquote>{quote}</blockquote>
          <figcaption>
            <strong>{author}</strong>
            <span>{role}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  </section>
);

export default Testimonials;
