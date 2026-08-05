module.exports = {
  preset: 'react-native',
  moduleNameMapper: {
    // Side-effect-only polyfills shipped as ESM importing a `.ts` path: Metro bundles
    // it, jest cannot parse it, and nothing under test reads from it.
    '^@walletconnect/react-native-compat$': '<rootDir>/__mocks__/walletconnectCompat.js',
  },
  // wagmi and viem ship ESM only. Metro handles that; jest does not, and the
  // react-native preset's default pattern skips everything in node_modules except
  // react-native itself, so anything importing `wagmi/chains` dies on `export *`.
  transformIgnorePatterns: [
    'node_modules/(?!(?:@react-native|react-native|wagmi|@wagmi|viem|ox|abitype)/)',
  ],
};
