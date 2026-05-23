import './StatsBandSection.css';

const STATS = [
  { value: '10,000+', label: 'Unique Pets' },
  { value: '5,250+', label: 'Pet Holders' },
  { value: '1M+', label: 'Battles Fought' },
  { value: '$2.5M', label: 'Rewards Earned' },
];

export default function StatsBandSection() {
  return (
    <section className="stats-band" aria-label="Project statistics" id="stats">
      {STATS.map((stat) => (
        <div className="stat-item" key={stat.label}>
          <strong>{stat.value}</strong>
          <span>{stat.label}</span>
        </div>
      ))}
    </section>
  );
}
