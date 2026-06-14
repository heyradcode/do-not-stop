import { describe, expect, it } from 'vitest';

/**
 * Boot smoke test: importing the app executes the whole module graph — env
 * validation, every route module, the GraphQL schema build (buildSchema runs at
 * import), and the Prisma client construction (lazy; no connection). tsc can't
 * catch a runtime module-load throw (e.g. a malformed SDL string), so this does:
 * if any of the wiring throws on load, this fails instead of the server on boot.
 */
describe('app boot', () => {
    it('loads the full app wiring without throwing', async () => {
        const { default: app } = await import('./app');
        // Express app is a callable request handler.
        expect(typeof app).toBe('function');
    });
});
