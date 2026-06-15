// Aggregates each package's vitest `coverage-summary.json` into a single
// markdown table for the PR coverage comment. Each row is one system (package)
// with its four metrics plus a per-system Overall (covered/total blended across
// the metrics). Packages whose suite did not produce a report (e.g. it failed
// before writing) are shown as "no report" rather than aborting.
import { readFileSync } from 'node:fs';

const packages = [
    { name: 'backend', dir: 'backend' },
    { name: 'frontend', dir: 'frontend' },
    { name: 'shared', dir: 'shared' },
];

// Column order; keys must match the coverage-summary `total` object.
const metrics = ['statements', 'branches', 'functions', 'lines'];

const pct = (covered, total) => (total === 0 ? 100 : (covered / total) * 100);
const cell = (m) => `${m.pct.toFixed(2)}% (${m.covered}/${m.total})`;

// Per-system overall: pool covered/total across all four metrics.
const overall = (total) => {
    let covered = 0;
    let tot = 0;
    for (const k of metrics) {
        covered += total[k].covered;
        tot += total[k].total;
    }
    return { covered, total: tot, pct: pct(covered, tot) };
};

const rows = packages.map((pkg) => {
    let total;
    try {
        total = JSON.parse(readFileSync(`${pkg.dir}/coverage/coverage-summary.json`, 'utf8')).total;
    } catch {
        return `| ${pkg.name} | _no report_ | _no report_ | _no report_ | _no report_ | _no report_ |`;
    }
    const metricCells = metrics.map((k) => cell(total[k])).join(' | ');
    return `| ${pkg.name} | ${metricCells} | **${cell(overall(total))}** |`;
});

const markdown = [
    '## 🧪 Coverage',
    '',
    '| Package | Statements | Branches | Functions | Lines | Overall |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
].join('\n');

process.stdout.write(markdown);
