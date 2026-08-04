/**
 * Stub for `@walletconnect/react-native-compat`.
 *
 * That package is side-effect-only polyfills (TextEncoder, crypto.getRandomValues,
 * URL, Buffer) shipped as ESM importing a `.ts` path, which Metro bundles but jest
 * cannot parse. Nothing under test reads from it, so a stub is enough — and it keeps
 * the alternative, transforming a dependency's TypeScript, out of the test setup.
 */
module.exports = {};
