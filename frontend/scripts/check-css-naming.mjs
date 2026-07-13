#!/usr/bin/env node
/**
 * CSS naming guard — fails if any stylesheet reintroduces BEM `__` element
 * class names (e.g. `.cp-shell__content`, `.breed-parent__stat-fill`).
 *
 * The frontend refactor removed every `__` BEM name in favour of CSS Modules
 * (local `camelCase`) and flat global classes; this check keeps it that way.
 * Run via `pnpm lint:css`. Zero dependencies on purpose — a full stylelint setup
 * would flag unrelated pre-existing style issues and needs CSS-Modules-aware
 * config; this enforces the one convention we actually agreed on.
 *
 * NOTE: `--` view-modifiers on the intentionally-global theming classes
 * (`.interaction-standalone--battle`, …) are allowed — they are not the target.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

/** A class selector whose name contains a `__` (BEM element). */
const BEM_ELEMENT = /\.[a-zA-Z][a-zA-Z0-9-]*__[a-zA-Z0-9-]+/g;

/** Recursively collect every *.css file (CSS Modules included) under a dir. */
function cssFiles(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...cssFiles(full));
        else if (entry.endsWith('.css')) out.push(full);
    }
    return out;
}

const violations = [];
for (const file of cssFiles(SRC)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
        for (const match of line.matchAll(BEM_ELEMENT)) {
            violations.push({ file: relative(process.cwd(), file), line: i + 1, name: match[0] });
        }
    });
}

if (violations.length > 0) {
    console.error('✗ CSS naming check failed — BEM `__` element class names are not allowed.\n');
    for (const v of violations) {
        console.error(`  ${v.file}:${v.line}  ${v.name}`);
    }
    console.error(
        '\nUse a CSS Module with a local camelCase class (`import s from \'./index.module.css\'`)' +
            '\nor a flat global class instead of BEM `__`. See frontend/REFACTORING_PLAN.md.',
    );
    process.exit(1);
}

console.log('✓ CSS naming check passed — no BEM `__` element class names found.');
