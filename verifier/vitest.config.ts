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
            include: ['src/**/*.ts'],
            exclude: [...coverageConfigDefaults.exclude, 'src/**/index.ts'],
        },
    },
});
