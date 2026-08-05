import { describe, expect, it } from 'vitest';

/**
 * Boot smoke test: importing the app executes the whole module graph — env
 * validation, every route module, the GraphQL schema build (buildSchema runs at
 * import), and the Prisma client construction (lazy; no connection). tsc can't
 * catch a runtime module-load throw (e.g. a malformed SDL string), so this does:
 * if any of the wiring throws on load, this fails instead of the server on boot.
 *
 * Given a generous timeout rather than the 5s default: this is the one test whose
 * work *is* the import, and it runs in a worker competing with 77 other files. On a
 * cold filesystem cache (a fresh install, or a CI runner) that import has taken
 * longer than 5s and failed the suite on timing alone. A fast run never waits.
 */
describe('app boot', () => {
    it('loads the full app wiring without throwing', async () => {
        const { default: app } = await import('../src/app');
        // Express app is a callable request handler.
        expect(typeof app).toBe('function');
    }, 30_000);
});
