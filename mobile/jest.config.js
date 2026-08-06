/**
 * Solana v2 packages ship `dist/index.node.cjs` alongside their `.mjs` builds.
 * Generated from what is actually installed:
 *   ls node_modules/@solana | while read n; do
 *     [ -f "$n/dist/index.node.cjs" ] && echo "$n"; done | paste -sd'|' -
 * Enumerated rather than matched with a wildcard because `@solana/buffer-layout`,
 * a web3.js v1 dependency, has no such build and a blanket pattern maps it to a
 * file that does not exist.
 */
const SOLANA_V2_PACKAGES =
  'accounts|addresses|assertions|codecs|codecs-core|codecs-data-structures|codecs-numbers|' +
  'codecs-strings|errors|fast-stable-stringify|functional|instructions|keys|kit|options|' +
  'programs|promises|rpc|rpc-api|rpc-parsed-types|rpc-spec|rpc-spec-types|rpc-subscriptions|' +
  'rpc-subscriptions-api|rpc-subscriptions-channel-websocket|rpc-subscriptions-spec|' +
  'rpc-transformers|rpc-transport-http|rpc-types|signers|subscribable|sysvars|' +
  'transaction-confirmation|transaction-messages|transactions';

module.exports = {
  preset: 'react-native',
  // v8, not the default babel provider. `babel-plugin-istanbul` rewrites the
  // module body before `react-native-dotenv` gets to replace the `@env` import,
  // and that plugin then dies on the moved node with `ReferenceError: Container
  // is falsy`. It takes down every suite reaching a file that reads `@env`, and
  // the failure is reported as 0% coverage on those files rather than as a
  // broken run, so `jest --coverage` looks like it worked and quietly measured
  // nothing. v8 instruments at runtime and never touches the AST.
  coverageProvider: 'v8',
  // Jest's 5s default is measured per test, and the first test in a suite also
  // pays for transforming everything that suite imports. With a warm cache that
  // is invisible; with a cold one, which is every CI run and every run after a
  // config change, half the suites time out and the failure reads as a hang
  // rather than as a slow first pass. Verified by `jest --clearCache`.
  testTimeout: 30000,
  moduleNameMapper: {
    // Side-effect-only polyfills shipped as ESM importing a `.ts` path: Metro bundles
    // it, jest cannot parse it, and nothing under test reads from it.
    '^@walletconnect/react-native-compat$': '<rootDir>/__mocks__/walletconnectCompat.js',

    // The two redirects below are what make `@solana/web3.js` importable here.
    // Both are resolution problems, not transform ones, so `transformIgnorePatterns`
    // cannot reach either.
    //
    // `rpc-websockets` declares only `browser`, `node` and `types` export
    // conditions. The react-native resolver asks for `react-native`, matches
    // nothing, and there is no fallback, so it reports the package as missing
    // even though it is installed.
    '^rpc-websockets$': '<rootDir>/../node_modules/rpc-websockets/dist/index.cjs',
    // Solana v2 packages do carry a `react-native` condition, pointing at an
    // `.mjs` build that this transform never runs over. Their CJS build is
    // equivalent for tests and needs no transform at all.
    [`^@solana/(${SOLANA_V2_PACKAGES})$`]:
      '<rootDir>/../node_modules/@solana/$1/dist/index.node.cjs',
  },
  // wagmi, viem and React Navigation ship ESM only. Metro handles that; jest does
  // not, and the react-native preset's default pattern skips everything in
  // node_modules except react-native itself, so importing any of them dies on
  // `export *`. `react-native-*` covers the navigation native peers (screens,
  // safe-area-context) as well as react-native itself. `uuid` is here because
  // web3.js reaches its ESM browser build.
  transformIgnorePatterns: [
    'node_modules/(?!(?:@react-native|react-native|react-native-.*|@react-navigation|wagmi|@wagmi|viem|ox|abitype|uuid)/)',
  ],
};
