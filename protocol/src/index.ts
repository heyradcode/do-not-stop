/**
 * Canonical battle protocol: encodings, hashes, seed derivation, ruleset, and the
 * commitment/receipt schemas. MIT, so third parties can replay signed receipts.
 *
 * See the package README for the constraints every module here must hold to
 * (no clock, no ambient randomness, no I/O, canonical encoding only).
 *
 * Modules land here in the order set by docs/plan-backend-battle-steps.md.
 */

/** Package identity, exported so a consumer can assert which protocol build it loaded. */
export const PROTOCOL_PACKAGE = '@cryptopets/protocol';
