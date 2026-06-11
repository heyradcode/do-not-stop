import path from 'path';

/** Resolve `@config/*`, `@features/*`, etc. from this file's directory (src/ or dist/src/). */
const root = __dirname;

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('module-alias').addAliases({
    '@config': path.join(root, 'config'),
    '@routes': path.join(root, 'routes'),
    '@features': path.join(root, 'features'),
    '@middleware': path.join(root, 'middleware'),
    '@repositories': path.join(root, 'repositories'),
    '@utils': path.join(root, 'utils'),
    '@typings': path.join(root, 'types'),
    '@generated': path.join(root, 'generated'),
    '@graphql': path.join(root, 'graphql', 'index.js'),
});
