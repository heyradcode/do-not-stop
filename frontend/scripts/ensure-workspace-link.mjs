import { access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const sharedEntry = join(frontendRoot, '..', 'shared', 'src', 'index.ts');
const linkedPackage = join(frontendRoot, 'node_modules', '@shared', 'core');

async function exists(path) {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}

const hasLink = await exists(linkedPackage);
const hasSharedSource = await exists(sharedEntry);

if (!hasLink && !hasSharedSource) {
    console.error(
        'Cannot build frontend: @shared/core is missing.\n' +
            'Run `pnpm install` from the repo root (not only inside frontend/).'
    );
    process.exit(1);
}

if (!hasLink) {
    console.warn(
        'Warning: frontend/node_modules/@shared/core is not linked. ' +
            'TypeScript will use ../shared via path mapping; run `pnpm install` from repo root.'
    );
}
