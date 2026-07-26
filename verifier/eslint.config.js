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
            // A Node CLI, not a protocol module: unlike `protocol`, this package does real
            // I/O (reads files, fetches URLs) and reads the clock freely, so none of
            // `protocol`'s determinism restrictions apply here.
            globals: { ...globals.node },
        },
        plugins: {
            import: importPlugin,
        },
        rules: {
            'import/no-unresolved': 'off',
            'import/no-duplicates': 'error',
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/no-explicit-any': 'error',
            'prefer-const': 'error',
            'semi': ['error', 'always'],
            'arrow-spacing': ['error', { before: true, after: true }],
        },
    },
    {
        files: ['tests/**/*.ts'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
        },
    },
);
