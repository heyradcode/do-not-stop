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
  moduleNameMapper: {
    // Side-effect-only polyfills shipped as ESM importing a `.ts` path: Metro bundles
    // it, jest cannot parse it, and nothing under test reads from it.
    '^@walletconnect/react-native-compat$': '<rootDir>/__mocks__/walletconnectCompat.js',
  },
  // wagmi, viem and React Navigation ship ESM only. Metro handles that; jest does
  // not, and the react-native preset's default pattern skips everything in
  // node_modules except react-native itself, so importing any of them dies on
  // `export *`. `react-native-*` covers the navigation native peers (screens,
  // safe-area-context) as well as react-native itself.
  // Deliberately does not list @solana, and adding it does not help: the blocker
  // is that `@solana/codecs-numbers` resolves to `index.native.mjs`, and jest does
  // not run this transform over `.mjs` regardless of the ignore pattern. Anything
  // importing `@solana/web3.js`, directly or through the `@shared/core` barrel, is
  // therefore untestable here. Stub the barrel and require the specific util
  // module instead (see GalleryScreen.test.tsx); for code that genuinely needs a
  // real `Transaction`, there is no working setup yet.
  transformIgnorePatterns: [
    'node_modules/(?!(?:@react-native|react-native|react-native-.*|@react-navigation|wagmi|@wagmi|viem|ox|abitype)/)',
  ],
};
