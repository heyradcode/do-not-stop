import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['node_modules/', 'dist/', 'coverage/'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['**/*.ts'],
        languageOptions: {
            ecmaVersion: 'latest',
            globals: { ...globals.node },
        },
        rules: {
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            'prefer-const': 'error',
            // Matches the shared package's formatting rules so code moving
            // between here and the rest of the monorepo reads the same.
            'semi': ['error', 'always'],
            'arrow-spacing': ['error', { before: true, after: true }],
        },
    },
);
