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

## What is checked so far

This is Step 30: the two checks that need nothing but the receipts themselves.

- **Operator signature** (`checkOperatorSignature`). Recomputes the receipt's own hash, recovers
  the address that produced the stored ECDSA signature over it (`recoverAddress`, pure
  `@noble/curves` secp256k1 recovery — no `ethers` dependency), and checks it against a
  caller-supplied trusted key list. A receipt whose signing key is not in that list, or whose
  `createdAt` falls outside the key's published validity window, fails closed.
- **Hash-chain continuity** (`checkChainContinuity`). Wraps `verifyReceiptChain` from
  `@cryptopets/protocol`: every receipt in a run links to its predecessor's real hash, sequence
  numbers are consecutive, and nothing is out of order.

**Not yet covered** (Step 31): the drand BLS beacon signature, seed derivation, replaying the
actual fight from the combat log, and recomputing the progression delta. `verifyReceiptConsistency`
in `@cryptopets/protocol` already implements the beacon and progression halves of that; Step 31
wires those in here alongside the combat replay itself and turns everything into the
per-check pass/fail CLI output §H describes.

## Usage

```bash
# Programmatic
pnpm --filter @cryptopets/verifier exec tsx -e "
  import { loadReceipts, loadSigningKeys, verifyReceipts } from './src/index.ts';
  const envelopes = await loadReceipts('./some-receipt.json');
  const keys = await loadSigningKeys('https://api.example.com/api/battle/signing-keys');
  console.log(verifyReceipts(envelopes, keys));
"

# CLI (dev, via tsx — see the note below on packaging)
pnpm --filter @cryptopets/verifier cli -- ./some-receipt.json --keys ./trusted-keys.json
pnpm --filter @cryptopets/verifier cli -- https://api.example.com/api/receipts?signingKeyId=battle-signer-2026-07 --keys https://api.example.com/api/battle/signing-keys
```

`loadReceipts` accepts a local file path or an `http(s)` URL, and any of the shapes
`backend/API.md` actually serves: a single receipt (`GET /api/battle/:battleId/receipt`), a
corpus page (`GET /api/receipts/...`), or a bare array. `loadSigningKeys` accepts
`GET /api/battle/signing-keys`'s `{ keys: [...] }` shape, or a bare array for a hand-written
trust file.

Omitting `--keys` does not skip the operator-signature check — it means no key is trusted, so
every receipt fails that check rather than silently passing one nobody actually verified.

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
