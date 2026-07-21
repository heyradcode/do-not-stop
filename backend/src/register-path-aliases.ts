import fs from 'node:fs';
import path from 'path';

/** Resolve `@config/*`, `@features/*`, etc. from this file's directory (src/ or dist/src/). */
const root = __dirname;

/**
 * Production build emits `dist/shared-node.cjs` (see scripts/bundle-shared-node.cjs).
 * Local `tsx src/server.ts` falls back to the raw shared entry (tsx can load .ts).
 */
const sharedNodeBundle = path.join(root, '..', 'shared-node.cjs');
const sharedNodeDev = path.join(root, '..', '..', 'shared', 'src', 'node.ts');
const sharedNode = fs.existsSync(sharedNodeBundle) ? sharedNodeBundle : sharedNodeDev;

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('module-alias').addAliases({
    '@shared/core/node': sharedNode,
    '@config': path.join(root, 'config'),
    '@routes': path.join(root, 'routes'),
    '@features': path.join(root, 'features'),
    '@middleware': path.join(root, 'middleware'),
    '@repositories': path.join(root, 'repositories'),
    '@grpc-client': path.join(root, 'grpc'),
    '@ws': path.join(root, 'ws'),
    '@utils': path.join(root, 'utils'),
    '@typings': path.join(root, 'types'),
    '@generated': path.join(root, 'generated'),
    '@graphql': path.join(root, 'graphql', 'index.js'),
});
