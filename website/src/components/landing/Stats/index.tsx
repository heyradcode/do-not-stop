import './Stats.css';

const ITEMS = [
  { value: '10,000+', label: 'Unique Pets' },
  { value: '5,250+', label: 'Pet Holders' },
  { value: '1M+', label: 'Battles Fought' },
  { value: '$2.5M', label: 'Rewards Earned' },
];

const Stats = () => (
  <section className="stats" aria-label="Project statistics" id="stats" data-reveal-stagger="80">
    {ITEMS.map(({ value, label }) => (
      <div className="item" key={label} data-reveal="up">
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    ))}
  </section>
);

export default Stats;
