import { defineConfig, coverageConfigDefaults } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/**/*.{test,spec}.ts'],
        coverage: {
            provider: 'v8',
            reportsDirectory: './coverage',
            reporter: ['text', 'html', 'lcov', 'json', 'json-summary'],
            // Whole-project scope: every source file counts toward coverage, so
            // the percentage reflects the real project rather than a hand-picked
            // slice. Untested files report as 0% and the number climbs as the
            // component/hook test branches land.
            include: ['src/**/*.{ts,tsx}'],
            exclude: [
                ...coverageConfigDefaults.exclude,
                'src/**/*.d.ts', // vite-env.d.ts etc.
                'src/main.tsx', // app bootstrap
                'src/assets/**',
            ],
        },
    },
});