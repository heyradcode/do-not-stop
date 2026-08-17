import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    // `src/generated/` is the Prisma client: machine-written, rewritten on every
    // `prisma generate`, and not ours to lint.
    { ignores: ['node_modules/', 'dist/', 'coverage/', 'src/generated/'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        // .cjs too: the build scripts are CommonJS and would otherwise be linted
        // without node globals, flagging require and __dirname as undefined.
        files: ['**/*.ts', '**/*.cjs'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { ...globals.node },
        },
        rules: {
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
            ],
            'prefer-const': 'error',
            // Matches the other packages' formatting rules so code moving between
            // here and the rest of the monorepo reads the same.
            'semi': ['error', 'always'],
            'arrow-spacing': ['error', { before: true, after: true }],
        },
    },
    {
        /**
         * Two type-aware rules, and only two.
         *
         * Express 4 does not await route handlers, so an `async` one passed raw to
         * `router.get` rejects into nothing: an unhandled rejection, which Node 24 exits the
         * process on. `app.ts` and `middleware/asyncRoute.ts` both record that a single
         * failed battle accept took the server down that way, and the fix — wrap anything
         * async — had been applied to one route file out of eleven.
         *
         * `no-misused-promises` is what catches the omission, and `no-floating-promises`
         * catches the other half of the same class. The rest of `recommendedTypeChecked` is
         * left off deliberately: this is a guard against a known outage, not a new
         * lint sweep, and turning on thirty rules at once would bury it.
         *
         * Type-aware linting needs the program, hence `projectService`. It costs a few
         * seconds on `pnpm lint`.
         */
        files: ['src/**/*.ts'],
        languageOptions: {
            parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
        },
        rules: {
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-misused-promises': 'error',
        },
    },
    {
        // The build scripts are CommonJS on purpose: they run as plain node before
        // and after tsc, outside the compiled ESM output, so require() is correct
        // here rather than a lapse.
        files: ['**/*.cjs'],
        rules: {
            '@typescript-eslint/no-require-imports': 'off',
        },
    },
    {
        // Tests use loose types for fixtures and stubs.
        files: ['tests/**/*.ts'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
        },
    },
);
