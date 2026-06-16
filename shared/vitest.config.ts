import { defineConfig, coverageConfigDefaults } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/**/*.{test,spec}.{ts,tsx}'],
        coverage: {
            provider: 'v8',
            reportsDirectory: './coverage',
            reporter: ['text', 'html', 'lcov', 'json', 'json-summary'],
            // Whole-project scope: every source file counts toward coverage, so
            // the percentage reflects the real project rather than just the pure
            // utils. Untested files report as 0% and climb as more suites land.
            include: ['src/**/*.ts'],
            exclude: [
                ...coverageConfigDefaults.exclude,
                'src/types/**', // type-only declarations
                'src/**/index.ts', // barrel re-exports
            ],
        },
    },
});
