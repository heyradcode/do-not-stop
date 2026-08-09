import { SECTION_COPY, TESTIMONIALS } from '@/content/landing';
import './Testimonials.css';

const { title, subtitle } = SECTION_COPY.testimonials;

const Testimonials = () => (
  <section className="landing-section testimonials" id="players" data-wash="violet">
    <h2 className="section-title" data-reveal="up">{title}</h2>
    <p className="section-subtitle" data-reveal="up">{subtitle}</p>
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
