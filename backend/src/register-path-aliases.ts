import path from 'path';

/** Resolve `@config/*`, `@features/*`, etc. from this file's directory (src/ or dist/src/). */
const root = __dirname;

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('module-alias').addAliases({
    '@config': path.join(root, 'config'),
    '@features': path.join(root, 'features'),
    '@middleware': path.join(root, 'middleware'),
    '@indexer': path.join(root, 'indexer'),
    '@repositories': path.join(root, 'repositories'),
    '@utils': path.join(root, 'utils'),
    '@typings': path.join(root, 'types'),
    '@generated': path.join(root, 'generated'),
    // Solana indexer lives outside src/ (a sibling under indexing/), so it
    // resolves one level up: src/../indexing/solana → dist/src/../indexing/solana.
    '@solana': path.join(root, '..', 'indexing', 'solana'),
});
