import { TESTIMONIALS } from '@/content/landing';
import './Testimonials.css';

const Testimonials = () => (
  <section className="landing-section testimonials" id="players" data-wash="violet">
    <h3 className="section-title" data-reveal="up">From the Pack</h3>
    <p className="section-subtitle" data-reveal="up">What players are saying after their first 100 battles.</p>
    <div className="grid" data-reveal-stagger="90">
      {TESTIMONIALS.map(({ quote, author, role }) => (
        <figure className="card" key={author} data-reveal="rise">
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
