# Threat model: backend-authoritative battles

Scope: the design in [plan-backend-battle-architecture.md](./plan-backend-battle-architecture.md).
Step references point at [plan-backend-battle-steps.md](./plan-backend-battle-steps.md).

This document exists because moving battle resolution off-chain moves it inside our trust boundary.
Section §A of the architecture document states the trust model in one table. This is the expanded
version: who attacks what, what stops them, how we notice, and what is left over.

It covers the backend battle path only. The existing on-chain path (`GameLogic.sol`,
`settle_battle.rs`) keeps its own properties and is not re-analysed here.

## 1. Assets

| Asset | Why it matters | Authority |
|---|---|---|
| Pet and item ownership | Transferable value | Chain |
| Reward custody and claims | Transferable value | Chain |
| Battle signing key | Signs commitments and receipts; forgery source | KMS |
| Root publisher key | Anchors batches on-chain | KMS + multisig |
| Off-chain progression (XP, rating, streak) | Determines rewards and matchmaking | Backend |
| Signed receipt corpus | The evidence players hold against us | Backend, published |
| Commitment sequence | Proves which round each battle was bound to | Backend, delivered to players |

## 2. Actors

| Actor | Assumed capability |
|---|---|
| Player | Can sign with their own wallet, replay traffic, script requests, disconnect at will |
| External attacker | Network position, can hit any public endpoint, no keys |
| Insider with database access | Read and write Postgres, no KMS signing scope |
| Insider with signer access | Can request signatures over well-formed commitments and receipts |
| Dishonest operator | Controls all backend processes, both combat implementations, and the database |
| drand network | Assumed honest and live; a threshold of nodes would have to collude to bias a round |

The dishonest-operator row is the uncomfortable one and it is deliberate. Most controls below do not
stop that actor. They make the actor's lies detectable by anyone holding a commitment or a receipt.

## 3. Threats

Each row: what the attacker does, what stops or bounds it, how we notice, what is left.

### T1: randomness reroll after seeing the value

- **Attack.** Operator watches drand, computes the result, dislikes it, and claims the battle was
  always bound to a later round. Recompute, publish, everything self-consistent.
- **Control.** Commit before reveal (§E). The round is chosen mechanically as
  `currentVerifiedRound + 2`, and the signed `BattleCommitment` is returned synchronously in the
  accept response, before the round exists (Step 23).
- **Detection.** A reroll needs a second signature over the same `battleId`. Either player's stored
  commitment plus the published receipt is a provable equivocation.
- **Residual.** Only detectable if players keep their commitment. The client persists it to local
  storage (Step 33) and the endpoint serves it, but a player who never fetched it holds no evidence.
- **Non-control.** Persisting the chosen round in Postgres proves nothing. It is our database.
  Merkle anchoring does not help either, because anchoring happens after computation.

### T2: lying about the result

- **Attack.** Publish a receipt whose winner does not follow from its own inputs.
- **Control.** None preventive. The receipt carries every input, so the result is recomputable.
- **Detection.** Public replay (§H). Anyone runs the verifier and the check fails.
- **Residual.** Only caught if someone runs the verifier. That is why it ships in Phase 3 while
  nothing of value is at stake (Steps 30 to 32), and why we run it in CI against a corpus fixture
  and monitor it ourselves.

### T3: hiding a battle

- **Attack.** Resolve a battle, dislike the outcome, never publish the receipt.
- **Control.** None preventive. Receipts are sequenced and hash-chained globally and per pet (§G).
- **Detection.** A gap breaks the chain. The per-pet chain also means a player who holds their own
  commitment can show a committed battle with no corresponding receipt.
- **Residual.** Visible, not impossible. If omission risk becomes unacceptable, §I's delayed
  direct-receipt claim fallback or an optimistic challenge protocol is the next step.

### T4: signing-key compromise

- **Attack.** Stolen key signs arbitrary commitments and receipts.
- **Control.** Key in KMS, never in API or worker environments. Signer accepts only the exact
  commitment and receipt schemas, never a generic state-mutation payload. No asset custody, no
  withdrawal authority. Separate keys per reward domain. Reward caps bound the economic damage
  (Step 22, §I).
- **Detection.** KMS request logging of every digest and key version. Signer throughput outside
  expected range. Receipts that exist in the corpus but not in the ledger. Hash-chain forks.
- **Residual.** Real. Bounded, not eliminated. See
  [runbook-signing-key-compromise.md](./runbook-signing-key-compromise.md).

### T5: outcome grinding by submit-and-abandon

- **Attack.** Submit many battles, abandon the ones that seed badly, keep the good ones.
- **Control.** No player-initiated cancellation after `committed` (§E). Disconnection, tab close,
  and app kill do not affect resolution. Per-wallet and per-pet rate limits, daily battle caps.
- **Detection.** Abandonment rate per wallet. Win distribution per wallet against the expected
  distribution for their matchups.
- **Residual.** A player can still choose which opponents to fight. That is matchmaking design, not
  a randomness leak.

### T6: manufactured beacon outage

- **Attack.** Player degrades their own connectivity, or an attacker degrades ours, to escape a
  battle already seeded against them.
- **Control.** The committed round is retried indefinitely and never substituted. On a genuine
  permanent outage past the timeout, the battle ends `forfeited` with no progression change and both
  pets stay locked for several rounds, so escaping costs more than losing (§E).
- **Detection.** drand fetch delay metric. Forfeit rate per wallet.
- **Residual.** A wallet that repeatedly forfeits is a rate-limit and abuse-policy matter.

### T7: intent replay

- **Attack.** Resubmit a captured signed intent to force extra battles.
- **Control.** `clientNonce` with a unique database constraint, `expiresAt`, and nonce consumption at
  acceptance (§D, Step 19).
- **Detection.** Repeated-nonce alert.
- **Residual.** None material.

### T8: cross-chain or cross-deployment replay

- **Attack.** Take a signature from staging and use it on production, or across chains.
- **Control.** Every signed object binds `chainId` and `deploymentId` (§D, Step 6). Intents,
  consents, commitments, and receipts all carry both, inside the hashed payload.
- **Detection.** Domain mismatch is a hard rejection, logged.
- **Residual.** None material, provided `deploymentId` is genuinely unique per environment.

### T9: forged defender consent

- **Attack.** Battle an unwilling defender, applying cooldown and rating changes to them.
- **Control.** `DefenseAuthorization` signed by the defender's wallet, bound to `rulesetHash`, with
  level band, daily cap, validity window, and `revocationNonce`. Every receipt embeds the hash of
  the authorization it relied on (§D, Step 20).
- **Detection.** Receipts referencing an unknown or revoked authorization hash fail public replay.
- **Residual.** Consent is to a ruleset version, so a rules change invalidates outstanding
  authorizations by design. Expect a re-consent prompt after every balance patch.

### T10: stale ownership after an NFT transfer

- **Attack.** Battle with a pet already sold, or snapshot a pet mid-transfer.
- **Control.** Ownership checked at the finalized source version, snapshot records
  `sourceChainVersions` (§G). Reconciliation job between finalized chain ownership, snapshots,
  receipts, and claims (§J).
- **Detection.** Reconciliation mismatch.
- **Residual.** Reorg depth on the source chain sets the finality wait, which is a latency cost, not
  a correctness gap.

### T11: concurrent battles with the same pet

- **Attack.** Race two battles for one pet so one snapshot is stale or a cooldown is skipped.
- **Control.** Both pets locked in deterministic id order inside a serializable transaction
  (Step 18). Snapshot persisted before randomness exists.
- **Detection.** Serialization-failure rate, duplicate-battle-id alert.
- **Residual.** None material. This is a correctness test target, not a monitoring target.

### T12: duplicate workers

- **Attack.** Two workers process the same transition, double-crediting progression or forking a
  hash chain.
- **Control.** Every transition idempotent, at-least-once processing assumed, each transition and its
  outbox message committed atomically. A duplicate battle id with a different payload is a security
  alert and never an upsert (§J, Step 18).
- **Detection.** Hash-chain discontinuity alert. Duplicate-payload alert.
- **Residual.** None material.

### T13: forged snapshot inputs

- **Attack.** Inflate a pet's stats, level, or equipment inside the snapshot.
- **Control.** Snapshot fields derive from indexed chain state at a recorded source version.
  Progression fields (`xp`, `streak`, `lastOpponentId`) are off-chain, so they are only checkable by
  replaying that pet's prior receipts, which the per-pet hash chain makes tractable (§G).
- **Detection.** Public replay walking a pet's chain catches a snapshot that does not follow from the
  previous receipt's `progressionDelta`.
- **Residual.** Equipment ownership must be verifiable from chain or from a signed inventory record
  before equipment affects combat. Until then, keep equipment out of combat inputs.

### T14: combat log leaks outcomes to spectators

- **Attack.** Read the outcome of every resolving battle by connecting to the WebSocket.
- **Control.** `liveBattleSocket.ts` currently broadcasts every message to every client. That is
  acceptable for chain-derived data and not acceptable for full combat logs. Subscriptions scope to
  the existing `BattleRoom` and the socket becomes notification-only (§J, Step 29).
- **Detection.** Route-level test asserting no cross-room delivery.
- **Residual.** Room ids are shareable by design, so a room link is a spectator link.

### T15: commitment accepted but never delivered

- **Attack.** Or, more likely, a bug. Accept succeeds, the player never receives the signed
  commitment, and the only record of the chosen round is ours. T1 is then undetectable for that
  battle.
- **Control.** Commitment signed and returned synchronously in the accept response, and also served
  from a public endpoint so it is re-fetchable (Steps 23, 27).
- **Detection.** Dedicated alert on accept-succeeded-without-commitment-delivery (§J).
- **Residual.** A player who never fetches it still holds no evidence. The public endpoint bounds
  this to non-malicious loss.

### T16: fraudulent or omitted reward batch

- **Attack.** Anchor a root covering receipts that were never signed, or omit signed receipts from
  every batch.
- **Control.** Per-battle, per-wallet, per-batch, and per-season reward caps. One-time claims with
  nullifiers. Emergency pause. Root publishers behind multisig and timelock. Published
  receipt-to-root inclusion proofs (§I).
- **Detection.** Receipt-omission alert past the inclusion SLO. Root-anchor delay alert. Verifier
  Merkle-inclusion check (Step 32).
- **Residual.** An unanchored signed receipt is evidence of operator failure, not an on-chain claim.

### T17: denial of service against popular opponents

- **Attack.** Flood a specific defender to exhaust their daily cap or keep their pets locked.
- **Control.** Per-wallet and per-pet rate limits, defender daily battle cap set by the defender
  themselves in their authorization (§D).
- **Detection.** Per-defender request-rate anomaly.
- **Residual.** A popular defender's cap is consumed by whoever gets there first. Matchmaking policy,
  not a cryptographic problem.

### T18: verifier collusion

- **Attack.** The Go verifier does not constrain a dishonest operator, because the same operator runs
  both processes and both ports descend from `CombatSim.sol`.
- **Control.** None, and none is claimed. The Go verifier's role is release safety: it catches
  implementation drift, bad deploys, and transcription bugs, and it hard-stops receipt signing on any
  mismatch (§F, Step 25).
- **Detection.** Engine/verifier mismatch alert with both outputs and all inputs retained.
- **Residual.** Dishonest computation is caught by public replay (T2), not by this.

### T19: database rollback or restore

- **Attack.** Restore Postgres to an earlier point and lose or rewrite receipts, including via an
  honest recovery.
- **Control.** Receipts are append-only and hash-chained, and the corpus is published, so an
  external copy exists outside the database. Append-only audit events for every transition.
- **Detection.** Chain discontinuity between the restored database and the published corpus.
- **Residual.** Recovery procedure must reconcile against the published corpus, not just restore.
  Point-in-time recovery drills have to include that reconciliation (Step 36).

## 4. Invariants

These are the properties tests and alerts exist to defend. Any one of them breaking is an incident,
not a bug report.

1. A `BattleCommitment` is signed and returned to the player before its committed drand round
   publishes.
2. The committed round is never substituted. Retry the same round or forfeit.
3. A battle that reaches `committed` always resolves. `rejected` exists only before `committed`.
4. The snapshot is persisted before any randomness for that battle exists.
5. The seed is derived only from the committed beacon value under the §E derivation. Never from
   timestamps, uuids, or backend secrets.
6. A receipt is signed only when the TypeScript engine and the Go verifier agree exactly.
7. Every receipt links its predecessor in the global chain and in both per-pet chains.
8. One `battleId` has at most one signed commitment and at most one signed receipt. A conflicting
   payload is an alert, never an upsert.
9. The signer accepts only commitment and receipt schemas, and holds no asset authority.
10. Off-chain XP is never represented as NFT state unless a successful aggregate claim applied it
    on-chain.

## 5. Accepted residual risk

Stated plainly, because §9 of the architecture document commits to stating it plainly.

- **A stolen signing key can sign lies.** Bounded by key isolation, schema restriction, reward caps,
  and the runbook. Not eliminated.
- **We can refuse to publish.** The chains make it visible, not impossible.
- **The receipt proves what we published, not that we were honest.** Public replay is the control,
  and it only works if replay actually happens.
- **The Go verifier does not constrain us**, only our deploys.

## 6. Escalation threshold

This design is proportionate while battle outcomes drive progression and capped, aggregate season
rewards. It stops being proportionate when a single battle's outcome carries significant transferable
value, or when reward caps have to be raised beyond what we would accept losing to a key compromise.

At that point the next steps are §M's deferred options: per-battle backend signature verified
on-chain (Phase 3.5), optimistic settlement with bonded challenges, or proof-based settlement. That
threshold should be crossed deliberately, with a review, not drifted past by raising caps one
increment at a time.
