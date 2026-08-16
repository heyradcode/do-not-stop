const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * `@switchboard-xyz/on-demand` reaches for anchor's NodeWallet behind a
 * try/catch, for the Node-only path it never takes here. Metro resolves
 * statically, so the catch does not save the bundle: it fails outright.
 *
 * The package already ships the answer, mapping that specifier to a throwing
 * stub in its `browser` field, but Metro resolves that relative redirect
 * against the scope directory rather than the package, looking for
 * `@switchboard-xyz/dist/...` with the `on-demand` segment dropped. Pointing at
 * the same stub by absolute path is what makes the bundle build.
 */
const SWITCHBOARD_NODEWALLET = '@coral-xyz/anchor-31/dist/cjs/nodewallet';

/**
 * Node built-ins the same package reaches for, which React Native does not
 * have. `crypto` is one `createHash('sha256')` in Surge's auth, a feature
 * nothing here uses, but Metro has to resolve it to build the graph at all.
 */
const nodeModuleShims = {
    [SWITCHBOARD_NODEWALLET]:
        '@switchboard-xyz/on-demand/dist/esm/shims/nodewallet.js',
    crypto: './src/shims/nodeCrypto.js',
    https: './src/shims/nodeHttps.js',
};

const shimPaths = Object.fromEntries(
    Object.entries(nodeModuleShims).map(([name, target]) => [
        name,
        require.resolve(target),
    ])
);

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
    // Include the monorepo root so Metro can watch and resolve symlinked deps
    watchFolders: [path.resolve(__dirname, '..')],
    resolver: {
        // Enable resolving through pnpm symlinks and package "exports"
        unstable_enableSymlinks: true,
        unstable_enablePackageExports: true,
        // Always prefer the app's own node_modules for dependencies
        extraNodeModules: new Proxy(
            {},
            {
                get: (_target, name) =>
                    path.join(__dirname, 'node_modules', String(name)),
            }
        ),
        resolveRequest: (context, moduleName, platform) =>
            shimPaths[moduleName]
                ? { type: 'sourceFile', filePath: shimPaths[moduleName] }
                : context.resolveRequest(context, moduleName, platform),
    },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);