import { defineConfig, coverageConfigDefaults } from 'vitest/config';
import { resolve } from 'node:path';

// Mirror the tsconfig "paths" aliases so tests can import via @config, @utils, etc.
const src = (p: string) => resolve(__dirname, 'src', p);

export default defineConfig({
    resolve: {
        alias: {
            '@config': src('config'),
            '@routes': src('routes'),
            '@features': src('features'),
            '@middleware': src('middleware'),
            '@repositories': src('repositories'),
            '@grpc-client': src('grpc'),
            '@ws': src('ws'),
            '@utils': src('utils/index.ts'),
            '@typings': src('types'),
            '@generated': src('generated'),
            '@graphql': src('graphql/index.ts'),
        },
    },
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/**/*.{test,spec}.ts'],
        setupFiles: ['./tests/setup.ts'],
        coverage: {
            provider: 'v8',
            reportsDirectory: './coverage',
            reporter: ['text', 'html', 'lcov', 'json', 'json-summary'],
            // Whole-project scope: every source file counts toward coverage, so
            // the percentage reflects the real project rather than a hand-picked
            // slice. Untested files report as 0% and the number climbs as the
            // other test branches (integration, etc.) land.
            include: ['src/**/*.ts'],
            exclude: [
                ...coverageConfigDefaults.exclude,
                'src/generated/**', // Prisma client + generated code
                'src/types/**', // type-only declarations
                'src/**/*.types.ts',
                'src/server.ts', // process bootstrap
                'src/register-path-aliases.ts',
            ],
        },
    },
});
