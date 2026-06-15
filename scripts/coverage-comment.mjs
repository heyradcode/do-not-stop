// Aggregates each package's vitest `coverage-summary.json` into a single
// markdown table for the PR coverage comment. Packages whose suite did not
// produce a report (e.g. it failed before writing) are shown as "no report"
// rather than aborting, so the comment always lands.
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

const totals = Object.fromEntries(metrics.map((k) => [k, { covered: 0, total: 0 }]));
const rows = [];

for (const pkg of packages) {
    let total;
    try {
        total = JSON.parse(
            readFileSync(`${pkg.dir}/coverage/coverage-summary.json`, 'utf8'),
        ).total;
    } catch {
        rows.push(`| ${pkg.name} | _no report_ | _no report_ | _no report_ | _no report_ |`);
        continue;
    }

    for (const k of metrics) {
        totals[k].covered += total[k].covered;
        totals[k].total += total[k].total;
    }
    rows.push(`| ${pkg.name} | ${metrics.map((k) => cell(total[k])).join(' | ')} |`);
}

const totalRow = `| **Total** | ${metrics
    .map((k) => `**${pct(totals[k].covered, totals[k].total).toFixed(2)}% (${totals[k].covered}/${totals[k].total})**`)
    .join(' | ')} |`;

const markdown = [
    '## 🧪 Coverage',
    '',
    '| Package | Statements | Branches | Functions | Lines |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    totalRow,
    '',
].join('\n');

process.stdout.write(markdown);
