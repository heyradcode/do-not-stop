import 'dotenv/config';
import { runOnce } from '../indexer';
import { prisma } from '../config/prisma';

/**
 * Run a single roster scan and exit. Useful for one-off refreshes or debugging
 * without leaving the timer running.
 *
 * Run: pnpm --filter backend index:once
 */
runOnce()
    .then(() => console.log('[indexer] one-shot scan complete'))
    .catch((err) => {
        console.error('[indexer] one-shot scan failed:', err);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
