/**
 * Bundle @cryptopets/protocol into plain CJS so production
 * `node dist/src/server.js` never has to load raw TypeScript from protocol/.
 *
 * Same reasoning as bundle-shared-node.cjs: the backend is compiled by tsc rather
 * than bundled, so a bare `require('@cryptopets/protocol')` in the emitted output
 * would resolve to a .ts entry point at runtime and crash. `register-path-aliases`
 * points the specifier at this bundle in production and at the raw source in dev,
 * where tsx can load TypeScript directly.
 */
const path = require('node:path');
const esbuild = require('esbuild');

const entry = path.resolve(__dirname, '../../protocol/src/index.ts');
const outfile = path.resolve(__dirname, '../dist/protocol.cjs');

esbuild
    .build({
        entryPoints: [entry],
        outfile,
        bundle: true,
        platform: 'node',
        format: 'cjs',
        target: 'node20',
        // @noble/* stay external: they ship CJS and are real backend dependencies.
        packages: 'external',
        logLevel: 'info',
    })
    .then(() => {
        console.log(`[bundle-protocol] ${entry} -> ${outfile}`);
    })
    .catch((err) => {
        console.error('[bundle-protocol] failed:', err);
        process.exit(1);
    });
