import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Vitest runs from the backend package dir. The unit tests target pure modules
 * (no env / Prisma / gRPC at runtime), so the tsconfig path aliases below are a
 * convenience for any future test rather than a hard requirement.
 */
const r = (p: string): string => path.resolve(process.cwd(), p);

export default defineConfig({
    test: {
        include: ['src/**/*.test.ts'],
        environment: 'node',
    },
    resolve: {
        alias: {
            '@config': r('src/config'),
            '@repositories': r('src/repositories'),
            '@features': r('src/features'),
            '@typings': r('src/types'),
            '@generated': r('src/generated'),
            '@utils': r('src/utils/index.ts'),
        },
    },
});
