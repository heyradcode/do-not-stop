/**
 * Standalone MIT verifier for CryptoPets backend-authoritative battle receipts
 * (docs/plan-backend-battle-architecture.md §H). Depends only on `@cryptopets/protocol`:
 * no backend access, no database.
 *
 * See the package README for what is and is not covered yet — checks land in the order
 * set by docs/plan-backend-battle-steps.md (Step 30: operator signature and hash-chain
 * continuity; Step 31 adds the drand beacon, seed derivation, combat replay, and
 * progression checks).
 */

export * from './checks';
export * from './io';
export * from './verify';
