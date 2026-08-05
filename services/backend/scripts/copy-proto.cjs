/**
 * Copy the shared gRPC contract next to the compiled backend so Render (and
 * any host that starts `node services/backend/dist/...` from the monorepo root) can
 * load it via path relative to __dirname — no cwd guessing.
 */
const fs = require('node:fs');
const path = require('node:path');

const src = path.resolve(__dirname, '../../../proto/cryptopets.proto');
const destDir = path.resolve(__dirname, '../dist/proto');
const dest = path.join(destDir, 'cryptopets.proto');

if (!fs.existsSync(src)) {
    console.error(`[copy-proto] missing ${src}`);
    process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log(`[copy-proto] ${src} -> ${dest}`);
