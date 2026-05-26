import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** Per-folder import aliases. Mirrors `tsconfig.app.json#compilerOptions.paths`. */
const aliases = {
    '@': 'src',
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
    plugins: [react()],
    resolve: {
        alias: Object.entries(aliases).map(([find, target]) => ({
            find,
            replacement: fileURLToPath(new URL(`./${target}`, import.meta.url)),
        })),
    },
});
