import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/**/*.{test,spec}.ts'],
        coverage: {
            provider: 'v8',
            reportsDirectory: './coverage',
            reporter: ['text', 'html', 'lcov', 'json', 'json-summary'],
            // Only the pure utilities are unit-tested here; hooks/contexts depend
            // on React + wallet SDKs and are out of scope for this suite.
            include: ['src/utils/**/*.ts'],
            exclude: ['src/utils/**/index.ts'],
        },
    },
});
