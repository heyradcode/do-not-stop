import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import importPlugin from 'eslint-plugin-import';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['node_modules/', 'dist/'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            ecmaVersion: 'latest',
            // Shared runs in browser, React Native, and Node — accept all standard globals.
            globals: { ...globals.browser, ...globals.node },
            parserOptions: {
                ecmaFeatures: { jsx: true },
            },
        },
        plugins: {
            react,
            'react-hooks': reactHooks,
            import: importPlugin,
        },
        rules: {
            ...react.configs.recommended.rules,
            ...reactHooks.configs.recommended.rules,
            'react/react-in-jsx-scope': 'off',
            'react/prop-types': 'off',
            'import/no-unresolved': 'off',
            'import/no-duplicates': 'error',
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-empty-object-type': 'off',
            'prefer-const': 'error',
            // Trailing semicolons on statements (incl. arrow-const declarations),
            // and exactly one space around => (catches the `): T  =>` double-space).
            // Both auto-fixable; neither touches intentional colon alignment.
            'semi': ['error', 'always'],
            'arrow-spacing': ['error', { before: true, after: true }],
        },
        settings: {
            react: { version: 'detect' },
        },
    },
);
