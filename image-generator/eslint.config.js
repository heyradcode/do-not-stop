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
            // ignoreRestSiblings covers `const { drop: _x, ...rest } = obj`, which is
            // how a property gets omitted under exactOptionalPropertyTypes, where
            // setting it to undefined is not the same thing.
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
            ],
            'prefer-const': 'error',
            // Matches the shared package's formatting rules so code moving
            // between here and the rest of the monorepo reads the same.
            'semi': ['error', 'always'],
            'arrow-spacing': ['error', { before: true, after: true }],
        },
    },
);
