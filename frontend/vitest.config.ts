import { defineConfig, mergeConfig, coverageConfigDefaults } from 'vitest/config';

import viteConfig from './vite.config';

// Reuse the app's vite config so tests resolve the same `@`-aliases and run
// through the React plugin; only the `test` block below is vitest-specific.
export default mergeConfig(
    viteConfig,
    defineConfig({
        test: {
            globals: true,
            // jsdom so hooks/components can render; pure ts tests run fine here too.
            environment: 'jsdom',
            include: ['tests/**/*.{test,spec}.{ts,tsx}'],
            setupFiles: ['./tests/setup.ts'],
            // CSS Modules resolve `s.foo` to the plain local name `foo` (not a
            // hashed `_foo_ab12`) so tests can assert on readable class names.
            css: { modules: { classNameStrategy: 'non-scoped' } },
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
    }),
);
