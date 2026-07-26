# @cryptopets/verifier

The standalone public verifier for CryptoPets backend-authoritative battle receipts (§H of
[docs/plan-backend-battle-architecture.md](../docs/plan-backend-battle-architecture.md)).

Sequencing: [docs/plan-backend-battle-steps.md](../docs/plan-backend-battle-steps.md), Group F.

## Why this exists, and why it is MIT

A backend that decides battle outcomes has to be checkable by someone other than the backend
itself. §H's argument is that anyone can take a signed receipt, recompute the fight from its own
published inputs, and compare — but that is only real if outsiders can actually run the checking
code. A verifier that requires a PolyForm Noncommercial license is not a verifier, it is a claim.
So this package is **MIT**, and it depends on nothing but `@cryptopets/protocol` (also MIT). No
backend access, no database — every check runs against a receipt's own contents plus whatever
public inputs the caller supplies (a signing-key list, and — once Step 31 lands — a live drand
endpoint).

## What is checked

Every check §H item 1 calls for, reported individually. `verifyReceipts` runs them all and never
stops at the first failure — "the beacon is forged" and "the XP is wrong" are different
accusations, and a verifier that stopped early would make the second invisible.

- **Seed derivation** (`checkSeedDerivation`). Recomputes the seed from the receipt's own domain,
  drand randomness, battle id, snapshot, and ruleset hash. This is what stops a favourable seed
  being stapled onto a genuine beacon and a genuine snapshot.
- **Operator signature** (`checkOperatorSignature`). Recomputes the receipt's own hash, recovers
  the address that produced the stored ECDSA signature over it (`recoverAddress`, pure
  `@noble/curves` secp256k1 recovery — no `ethers` dependency), and checks it against a
  caller-supplied trusted key list. A receipt whose signing key is not in that list, or whose
  `createdAt` falls outside the key's published validity window, fails closed.
- **Drand beacon** (`checkBeaconSignature`). Verifies the BLS12-381 signature against drand's
  public key, with the round number as the signed message. This is the check that makes
  commit-before-reveal mean anything: every cheaper check passes just as happily for randomness we
  invented, because we would have hashed our own invention consistently. Needs no ruleset, so it
  runs even when the named bundle could not be obtained.
- **Combat replay** (`checkCombatReplay`). Re-runs the fight from the frozen snapshot, the seed,
  and the named ruleset, then compares the winner, round count, winner HP, *and* the recomputed
  combat-log hash. Checking the log hash too means the log the operator serves separately
  (`GET /api/battle/:battleId/combat-log`) is pinned transitively.
- **Progression** (`checkProgression`). Recomputes the XP and level change and compares it. This
  is only a pure function of the receipt because the snapshot freezes `lastOpponentId` and
  `streak`, the same-opponent decay state XP depends on.
- **Hash-chain continuity** (`checkChainContinuity`). Every receipt in a run links to its
  predecessor's real hash, sequence numbers are consecutive, and nothing is out of order.

Two situations fail closed rather than being skipped quietly. A receipt that will not parse, or
fails its own internal consistency, is reported as `malformed-receipt` and left out of the chain
walk. A receipt naming a ruleset bundle the caller did not supply is reported as
`ruleset-unavailable`, and its replay and progression checks do not run — reporting those as passed
would be a lie, and omitting them silently would read as a clean bill of health.

**Not yet covered** (Step 32): fetching and pinning content-addressed ruleset artifacts
automatically, and a CI job running this over a committed corpus fixture. Merkle inclusion proofs
arrive with the batch registry (Group G).

## Usage

```bash
# CLI (dev, via tsx — see the note below on packaging)
pnpm --filter @cryptopets/verifier cli -- ./some-receipt.json --keys ./trusted-keys.json
pnpm --filter @cryptopets/verifier cli -- \
  'https://api.example.com/api/receipts?signingKeyId=battle-signer-2026-07' \
  --keys https://api.example.com/api/battle/signing-keys \
  --rulesets https://api.example.com/api/battle/rulesets/0xabc...
```

Output is one line per check, and the process exits non-zero if any failed:

```text
[PASS] seed-derivation
[PASS] operator-signature
[FAIL] beacon-signature: drand round 1000 does not verify against chain 0x52db9ba7...
[PASS] combat-replay
[PASS] progression
[PASS] chain-continuity
```

Programmatically, `verifyReceipts(envelopes, trustedKeys, { rulesets })` returns the same results
as `{ results, ok }`.

`loadReceipts` accepts a local file path or an `http(s)` URL, and any of the shapes
`backend/API.md` actually serves: a single receipt (`GET /api/battle/:battleId/receipt`), a
corpus page (`GET /api/receipts/...`), or a bare array. `loadSigningKeys` accepts
`GET /api/battle/signing-keys`'s `{ keys: [...] }` shape, or a bare array for a hand-written
trust file. `loadRulesets` accepts `GET /api/battle/rulesets/:rulesetHash`'s `{ ..., bundle }`
shape, a bare bundle, or an array of either — always keyed by the hash recomputed from the
bundle's own contents, never one the source claimed.

Both flags default to the safe answer rather than the convenient one:

- Omitting `--keys` does not skip the operator-signature check. It means no key is trusted, so
  every receipt fails that check rather than silently passing one nobody actually verified.
- Omitting `--rulesets` falls back to this build's source-default ruleset only. A battle fought
  under tuned `GameConfig` values then reports `ruleset-unavailable` instead of being replayed
  against the wrong numbers.

## Consumption

Raw TypeScript, no build step, same as `@cryptopets/protocol` — this package is a workspace
dependent of `protocol`, not the other way around. There is deliberately no `bin` entry or
publish-ready build yet: packaging this as an installable CLI (`npx @cryptopets/verifier ...`)
is later work, once there is an actual third party to hand it to. For now, run it from within
this workspace via `tsx`.

## Commands

```bash
pnpm --filter @cryptopets/verifier test        # vitest
pnpm --filter @cryptopets/verifier lint        # eslint
pnpm --filter @cryptopets/verifier typecheck   # tsc --noEmit
```
