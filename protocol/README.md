# @cryptopets/protocol

Canonical definitions for the backend-authoritative battle protocol: canonical encodings, hashes,
drand seed derivation, the versioned combat ruleset, and the receipt and commitment schemas.

Design: [docs/plan-backend-battle-architecture.md](../docs/plan-backend-battle-architecture.md).
Sequencing: [docs/plan-backend-battle-steps.md](../docs/plan-backend-battle-steps.md).

## Why this package exists, and why it is MIT

The rest of the app layer (`backend`, `frontend`, `mobile`, `shared`, `website`) is PolyForm
Noncommercial. This package is **MIT**, deliberately.

A backend that decides battle outcomes has to be checkable, and the mechanism that makes it
checkable is public replay: anyone takes a signed receipt, recomputes the fight from its inputs, and
compares. That is only real if outsiders can actually run the code. A verifier licensed
noncommercially is not a verifier, it is a claim. So everything needed to verify a receipt lives
here, under a license that permits running it, and the standalone verifier (`verifier/`) depends only
on this package.

The combat engine moved here from `shared/src/utils/combat/` for the same reason. The identical
algorithm is already MIT in `contracts/ethereum/src/CombatSim.sol`,
`contracts/solana/cryptopets`, and `services/indexer-go/internal/combat`, so this changes the license of a
fourth copy of published math, not of anything proprietary.

**Rule for new files here:** MIT only, and nothing in this package may import from a PolyForm
package. A test enforces the second half (`tests/package.test.ts`).

## Constraints

Everything in here must be reproducible by a third party, years later, with no access to our
infrastructure. That rules out more than it sounds like:

- **No clock reads.** No `Date.now()`, no `new Date()`. Timestamps are inputs. Enforced by eslint.
- **No ambient randomness.** No `Math.random()`. Randomness comes from the committed drand round.
  Enforced by eslint.
- **No I/O.** No network, no filesystem, no database, no environment variables. Callers fetch, this
  package computes.
- **No React, no hooks, no framework.** Pure functions over plain data.
- **Canonical encoding only.** Hashes are taken over the fixed binary encoding in `src/encoding/`,
  never over `JSON.stringify` output. Property order is not a specification.
- **Golden vectors for anything hashed.** Every hash and every combat rule has vectors in
  `contracts/test-vectors/`, so a port or a refactor that changes a byte fails loudly.

## Browser cost of beacon verification

§E of the architecture doc requires confirming what client-side BLS verification costs before
committing to drand, because a client that takes our word for the beacon value gets nothing from
commit-before-reveal.

Measured with esbuild (minified, `platform: browser`, `target: es2022`):

| Entry point | Minified | Minified + gzip |
|---|---|---|
| `verifyBeacon` + pinned quicknet params (pulls in `@noble/curves` BLS12-381) | 62.5 kB | 24.2 kB |
| Encoding and hashing only (`@noble/hashes`) | 4.7 kB | 2.1 kB |

So verification costs roughly **22 kB gzipped** on top of hashing. Against a frontend bundle already
over 2 MB gzipped, that is noise, and it is the only thing that makes the client's verification real
rather than trust. Re-measure if `@noble/curves` is upgraded.

## Consumption

Raw TypeScript, no build step, same as `@shared/core`. Workspace packages depend on it directly;
`shared` re-exports the combat engine so existing imports keep working.

## Commands

```bash
pnpm --filter @cryptopets/protocol test        # vitest
pnpm --filter @cryptopets/protocol lint        # eslint, incl. the determinism rules
pnpm --filter @cryptopets/protocol typecheck   # tsc --noEmit
```
