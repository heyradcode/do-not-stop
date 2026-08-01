import { defineConfig, coverageConfigDefaults } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov', 'json-summary'],
            include: ['src/**/*.ts'],
            exclude: [
                ...coverageConfigDefaults.exclude,
                // Entry points and argument parsing: thin wiring over code that is
                // covered directly, and only meaningfully exercised by running the
                // process, which CI does instead (see the workflow's container check).
                'src/main.ts',
                'src/cli.ts',
                'src/warmCli.ts',
            ],
        },
    },
});
