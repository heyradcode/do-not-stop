import { LANDING_TESTIMONIALS } from '../../constants/landingContent';
import './TestimonialsSection.css';

export default function TestimonialsSection() {
  return (
    <section className="landing-section testimonials" id="players">
      <h3 className="section-title">From the Pack</h3>
      <p className="section-subtitle">What players are saying after their first 100 battles.</p>
      <div className="testimonial-grid">
        {LANDING_TESTIMONIALS.map((t) => (
          <figure className="testimonial-card" key={t.author}>
            <span className="testimonial-quote-mark" aria-hidden="true">&ldquo;</span>
            <blockquote>{t.quote}</blockquote>
            <figcaption>
              <strong>{t.author}</strong>
              <span>{t.role}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
