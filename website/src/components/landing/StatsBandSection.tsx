import './StatsBandSection.css';

export default function StatsBandSection() {
  return (
    <section className="stats-band" aria-label="Project statistics">
      <div className="stat-item">
        <strong>10,000+</strong>
        <span>Unique Pets</span>
      </div>
      <div className="stat-item">
        <strong>5,250+</strong>
        <span>Pet Holders</span>
      </div>
      <div className="stat-item">
        <strong>1M+</strong>
        <span>Battles Fought</span>
      </div>
      <div className="stat-item">
        <strong>$2.5M</strong>
        <span>Rewards Earned</span>
      </div>
    </section>
  );
}
