import js from '@eslint/js';
import globals from 'globals';
import importPlugin from 'eslint-plugin-import';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['node_modules/', 'coverage/'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['**/*.ts'],
        languageOptions: {
            ecmaVersion: 'latest',
            // Runs in browser, React Native, Node, and the standalone verifier.
            // No React here: this package is pure computation, never UI.
            globals: { ...globals.browser, ...globals.node },
        },
        plugins: {
            import: importPlugin,
        },
        rules: {
            'import/no-unresolved': 'off',
            'import/no-duplicates': 'error',
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/no-empty-object-type': 'off',
            // Determinism rules. Every hash and every fight result in this package
            // must be reproducible years later on someone else's machine, so the
            // usual sources of drift are errors rather than style opinions.
            '@typescript-eslint/no-explicit-any': 'error',
            'no-restricted-properties': [
                'error',
                { object: 'Math', property: 'random', message: 'Randomness comes from the committed drand round, never from Math.random.' },
                { object: 'Date', property: 'now', message: 'Protocol code must not read the clock. Pass timestamps in as inputs.' },
            ],
            'no-restricted-syntax': [
                'error',
                { selector: "NewExpression[callee.name='Date']", message: 'Protocol code must not read the clock. Pass timestamps in as inputs.' },
            ],
            'prefer-const': 'error',
            'semi': ['error', 'always'],
            'arrow-spacing': ['error', { before: true, after: true }],
        },
    },
    {
        // Tests may read the clock and use loose types for fixtures.
        files: ['tests/**/*.ts'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            'no-restricted-properties': 'off',
            'no-restricted-syntax': 'off',
        },
    },
);
