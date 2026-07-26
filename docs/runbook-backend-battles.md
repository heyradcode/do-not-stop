# Runbook: backend-authoritative battles

Operating the backend battle mode described in
[plan-backend-battle-architecture.md](./plan-backend-battle-architecture.md). Covers the
four drills §L Phase 3 requires before the mode carries anything of value: recovery, replay,
key rotation, and incident response.

Key compromise has its own runbook:
[runbook-signing-key-compromise.md](./runbook-signing-key-compromise.md). This one is for
everything short of that.

## The drills are tests, not a checklist

Each drill below is executed by `backend/tests/features/battle-ledger/drills.test.ts`, so it
runs on every CI pass rather than being performed once and slowly becoming untrue. A drill
that only ever lived in this file would describe a system nobody had checked in months.

What the tests cannot cover is the human half — who gets paged, who decides, how long it
takes. That is what the procedures here are for.

## Turning the mode on and off

`BATTLE_BACKEND_MODE_ENABLED=true` enables it. Off by default.

| Off | On |
| --- | --- |
| `POST /api/battle/intents`, `/accept`, `/authorizations` return **503** | accepted |
| `DELETE /api/battle/authorizations` still works | works |
| every read route and `/api/receipts/*` still works | works |
| the outbox worker does not start | runs |
| no signing key required | required |

**Switching the mode off does not retract anything.** Receipts already issued stay served,
and the public corpus stays public. That asymmetry is the point: §H's claim is that anyone
can check what we did, and a feature flag that could un-publish past evidence would turn
every issued receipt into an assertion. Turning the mode off stops new battles only.

Revocation is ungated for the same class of reason — refusing battles is never the
dangerous direction, so a defender must be able to withdraw consent even after the mode is
off.

### Kill switch

Set `BATTLE_BACKEND_MODE_ENABLED=false` and restart. Battles already in flight stop
advancing (the worker is gone) and stay in whatever state they reached; they resume when
the mode is turned back on, because state lives in the ledger rather than in the worker.
Pets stay locked in the meantime — see *Stuck battles* below if that window is long.

## Drill 1: recovery

**Scenario.** A dependency failed long enough that outbox messages exhausted their retries
and dead-lettered. Battles are parked mid-pipeline.

Dead-lettering is deliberately not automatic-retry exhaustion to be undone by a cron. It
parks the battle for a person, because a message that failed eight times with exponential
backoff is usually failing for a reason that retrying will not fix.

**Procedure.**

1. List what is parked: `listDeadLetters()`. Each entry names the `battleId`, the `topic`
   it died on, and `lastError`.
2. Group by `lastError`. One shared cause (drand unreachable, indexer-go down, signer
   unconfigured) is the common case and means one fix.
3. Fix the cause. Confirm it is actually fixed before requeuing — a requeue against a still
   broken dependency just burns the retry budget again.
4. Requeue each message: `requeueDeadLetter(id, new Date())`. Attempts reset so backoff
   starts fresh. `lastError` is deliberately left in place; a requeue is not evidence the
   cause is gone.
5. Watch the battles advance. Anything that dead-letters a second time on the same error is
   not a transient failure and needs the incident procedure below.

**What is safe about this.** Requeuing cannot double-apply anything. Every worker is
idempotent on its own transition — each checks the battle's current state and completes the
message as a no-op if another worker already moved it — so a message that actually
succeeded before dying is harmless to run again.

## Drill 2: replay

**Scenario.** Confirming that receipts this deployment issued verify independently. Run
routinely, not only during an incident: the value of a receipt is that someone outside can
check it, and a claim nobody has ever tested is not worth much.

**Procedure.**

1. Export a corpus: `GET /api/receipts?signingKeyId=<id>` and page through `nextAfter`.
2. Fetch the published keys: `GET /api/battle/signing-keys`.
3. Run the standalone verifier over them, from a checkout with no access to this backend:
   ```bash
   pnpm --filter @cryptopets/verifier cli -- ./corpus.json --keys ./keys.json
   ```
4. Every check must pass and the exit code must be `0`.

The verifier holds its own pinned ruleset bundles, so this works with the backend entirely
unreachable — which is the situation the drill is really rehearsing.

**If it fails.** A failing check is not automatically our fault: confirm the corpus and key
list were fetched completely and that the ruleset the receipts name is one the verifier
holds (`ruleset-unavailable` means it is not). A genuine `combat-replay`,
`beacon-signature`, or `operator-signature` failure is an incident — go to Drill 4.

## Drill 3: key rotation

**Scenario.** Routine rotation, or a key approaching the end of its validity window. For a
*compromised* key, stop and use
[runbook-signing-key-compromise.md](./runbook-signing-key-compromise.md) instead.

**Procedure.**

1. Provision the new key in the KMS. It never leaves the KMS; the backend holds a reference.
2. Register the outgoing key as rotated: `registerRotatedKey(descriptor)` with `notAfter`
   set. It stays published from `GET /api/battle/signing-keys` permanently.
3. Point the signer at the new key and restart.
4. Confirm `GET /api/battle/signing-keys` lists **both**, and that a receipt signed under
   the old key still verifies.

**The rule that matters.** A retired key is never removed from the published list. Receipts
signed under it must keep verifying forever, and delisting a key silently invalidates every
receipt it ever signed — a retroactive erasure of evidence, which is exactly what §G's
validity windows exist to make unnecessary.

**Known gap.** The key registry is in-memory. A key registered via `registerRotatedKey` does
not survive a process restart, so rotation is not yet durable across deploys and the
registry must be re-seeded at startup. This is a real limitation, not a footnote — it is
flagged in `backend/API.md` too, and it needs closing before the mode carries value.

## Drill 4: incident

### Engine mismatch (`verification_failed`)

The TypeScript engine and the Go verifier disagreed, so the battle was never signed. This is
the circuit breaker doing its job.

1. **Do not sign it.** There is no override, deliberately: signing something two engines
   disagree about is the one action that cannot be walked back.
2. Read `verificationDetail` on the ledger row. It holds both outputs and the field-level
   mismatches.
3. Reproduce offline from the receipt's inputs — the snapshot, seed, and ruleset are all in
   the row.
4. Whichever port is wrong, fix that port and rerun the golden vectors. **Never edit the
   vectors** (`AGENTS.md`).
5. Affected battles stay `verification_failed`. They are not retried into existence; the
   honest outcome is that the fight did not resolve.

### Shadow mismatch

Shadow mode (§L Phase 2) says the backend engine disagreed with the chain. Same substance as
above, with a stronger signal: the chain is the reference implementation. Blocks the Phase 3
gate until resolved. `shadowSummary()` is the durable record.

### Stuck battles

A battle not advancing is one of: a dead letter (Drill 1), a committed drand round that has
not published (waits, then forfeits — by design), or a worker that is not running (check the
mode flag).

Both pets stay locked until the battle reaches `signed` or a terminal state. If a battle is
genuinely unresolvable, moving it to a terminal state is what releases them; leaving it
pending indefinitely is worse for the player than a forfeit.

### Drand outage

Committed rounds are never substituted — §E allows only "keep waiting" or "give up". An
outage past `BATTLE_FORFEIT_AFTER_SECONDS` forfeits affected battles, with no progression
change. If an outage is ongoing, turn the mode off rather than let battles accumulate
toward mass forfeiture.

## What this mode deliberately does not do

- **No transferable reward.** Receipts carry no `rewardDelta` at any setting. Rewards arrive
  with the Merkle batch registry in Group I, behind their own caps and review.
- **No rating.** There is no rating or matchmaking-score system in this repo yet. §L Phase 3
  lists "off-chain XP, rating, and cooldown"; XP and cooldown exist in `pet_battle_progress`,
  stored separately from NFT state. Rating is a game-design decision — what it measures, how
  it decays, whether it is public — and is not something to invent as a side effect of
  shipping this mode.
- **No NFT mutation.** Backend battles never write pet state on chain. Off-chain progression
  lives in `pet_battle_progress`, keyed separately from `pet_roster`, so the two can never be
  confused for each other.
