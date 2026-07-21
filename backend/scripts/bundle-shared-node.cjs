/**
 * Bundle the Node-safe @shared/core surface into plain CJS so production
 * `node dist/src/server.js` never has to load raw TypeScript / ESM from shared/.
 *
 * Frontend/mobile keep consuming shared as raw TS via Vite; only the backend
 * needs this compile step.
 */
const path = require('node:path');
const esbuild = require('esbuild');

const entry = path.resolve(__dirname, '../../shared/src/node.ts');
const outfile = path.resolve(__dirname, '../dist/shared-node.cjs');

esbuild
    .build({
        entryPoints: [entry],
        outfile,
        bundle: true,
        platform: 'node',
        format: 'cjs',
        target: 'node20',
        // Keep heavy native/npm deps external; only inline our shared TS sources.
        packages: 'external',
        logLevel: 'info',
    })
    .then(() => {
        console.log(`[bundle-shared-node] ${entry} -> ${outfile}`);
    })
    .catch((err) => {
        console.error('[bundle-shared-node] failed:', err);
        process.exit(1);
    });
