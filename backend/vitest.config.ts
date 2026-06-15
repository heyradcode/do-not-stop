import { defineConfig } from 'vitest/config';
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
            // Scope coverage to the pure logic this unit suite targets. Routes,
            // controllers, gRPC, GraphQL, Prisma client and generated code need
            // integration/DB harnesses and are covered in a separate branch.
            include: [
                'src/utils/index.ts',
                'src/features/auth/**/*.ts',
                'src/features/dialogue/llm/**/*.ts',
                'src/features/dialogue/dialogue.schema.ts',
                'src/features/dialogue/result/turns.ts',
            ],
            exclude: ['**/*.types.ts'],
        },
    },
});
