import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * vite-tsconfig-paths resolves the `@config/*`, `@routes/*`, etc. aliases
 * straight from tsconfig.json, so tests (and the modules they import) use the
 * same path mapping as the build — no hand-maintained alias list to drift.
 */
export default defineConfig({
    plugins: [tsconfigPaths()],
    test: {
        include: ['src/**/*.test.ts'],
        environment: 'node',
        // A dummy URL so modules that read env at import (env.ts requires
        // DATABASE_URL) load under test. Prisma's client constructs its pool
        // lazily, so nothing actually connects — the boot smoke test just
        // verifies the module graph loads and the schema builds.
        env: {
            DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
        },
    },
});
