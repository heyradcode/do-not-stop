/* global globalThis */
const structuredCloneShim = require('@ungap/structured-clone').default;

/**
 * Web APIs Hermes does not provide, installed before the app renders.
 *
 * `structuredClone`: `@coral-xyz/anchor` camelCases an IDL by cloning it
 * (`structuredClone(idl)`), reached as soon as anything touches the Solana
 * program, so it throws on the first screen that reads pets rather than only in
 * a Solana-specific flow. React Native ships an implementation of its own, but
 * under `react-native/src/private/`, and it never installs it as a global.
 *
 * Guarded so a future Hermes or React Native that does provide it wins.
 */
if (typeof globalThis.structuredClone !== 'function') {
    globalThis.structuredClone = structuredCloneShim;
}
