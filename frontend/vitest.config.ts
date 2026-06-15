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
            // Scope coverage to the pure utils/constants this unit suite targets.
            // Hooks, components, contexts and chain SDK wiring depend on React +
            // wallet SDKs and are out of scope (covered in a component branch).
            include: [
                'src/utils/errorParser.ts',
                'src/constants/tokens.ts',
                'src/constants/chains/ethereum.ts',
                'src/constants/chains/solana.ts',
            ],
        },
    },
});