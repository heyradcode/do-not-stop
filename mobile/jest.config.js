module.exports = {
  preset: 'react-native',
  moduleNameMapper: {
    // Side-effect-only polyfills shipped as ESM importing a `.ts` path: Metro bundles
    // it, jest cannot parse it, and nothing under test reads from it.
    '^@walletconnect/react-native-compat$': '<rootDir>/__mocks__/walletconnectCompat.js',
  },
};
