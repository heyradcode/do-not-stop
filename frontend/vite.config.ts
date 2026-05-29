import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

/** Per-folder import aliases. Mirrors `tsconfig.app.json#compilerOptions.paths`. */
const aliases = {
    '@assets': 'src/assets',
    '@chains': 'src/chains',
    '@components': 'src/components',
    '@constants': 'src/constants',
    '@contexts': 'src/contexts',
    '@hooks': 'src/hooks',
    '@pages': 'src/pages',
    '@router': 'src/router',
    '@styles': 'src/styles',
    '@utils': 'src/utils',
} as const;

// https://vite.dev/config/
export default defineConfig({
    plugins: [react(),
        nodePolyfills({
            include: ['buffer', 'process', 'http', 'https', 'crypto', 'stream'],
        }),
    ],
    define: {
        'process.env': {}
    },
    resolve: {
        alias: [
            ...Object.entries(aliases).map(([find, target]) => ({
                find,
                replacement: fileURLToPath(new URL(`./${target}`, import.meta.url)),
            })),
            {
                find: '@shared/core',
                replacement: fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
            },
        ],
    },
});
