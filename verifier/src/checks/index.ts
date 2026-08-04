/**
 * The checks themselves, exported as `@cryptopets/verifier/checks`.
 *
 * This subpath exists so a browser can run the *same* verification code the CLI runs. Every
 * module here is pure — `@cryptopets/protocol` and type-only imports, no `node:fs`, no
 * network — while the package root pulls in the loaders and the pinned-artifact reader,
 * which are Node-only and would break a browser bundle.
 *
 * Keep it that way. A client that reimplemented these checks to avoid the dependency is
 * exactly how the browser's answer and the CLI's answer start disagreeing, and §H's argument
 * only holds while they cannot.
 */
export { checkBeaconSignature } from './beaconSignature';
export { checkChainContinuity } from './chainContinuity';
export { checkCombatReplay } from './combatReplay';
export { checkOperatorSignature } from './operatorSignature';
export { checkProgression } from './progression';
export { checkSeedDerivation } from './seedDerivation';
export type { CheckResult } from './types';
