/**
 * Standalone MIT verifier for CryptoPets backend-authoritative battle receipts
 * (docs/battle-protocol.md §H). Depends only on `@cryptopets/protocol`:
 * no backend access, no database.
 *
 * Checks operator signature, hash-chain continuity, the drand beacon, seed derivation,
 * combat replay, and progression. See the package README for what each one covers.
 */

export * from './checks';
export * from './io';
export * from './ruleset';
export * from './verify';
