# Runbook: battle signing key compromise

Applies to the KMS keys that sign `BattleCommitment` and `BattleReceipt` objects, and to the root
publisher key that anchors Merkle batches. See
[threat-model-backend-battles.md](./threat-model-backend-battles.md) T4 and T16.

Assume compromise means an attacker can produce signatures that verify against a published key. It
does not mean they can move assets: the battle signing key has no custody and no withdrawal
authority, and the root publisher sits behind multisig and timelock. That is what buys time here.

**Bias towards pausing.** A false alarm costs players a few hours of battles. A missed compromise
costs the integrity of every receipt signed in the window.

## Triggers

Any one of these starts this runbook. Do not wait for confirmation of intent.

- KMS audit log shows a signing request the pipeline cannot account for (no matching ledger row, no
  matching digest).
- Signer throughput outside expected range, or signing requests from an unexpected principal,
  network path, or region.
- A receipt or commitment exists in the public corpus with no corresponding ledger row.
- Hash-chain fork: two signed receipts claiming the same `previousReceiptHash`, or two commitments for
  one `battleId`.
- A player produces a signed commitment or receipt we did not issue.
- Credential exposure: KMS principal credentials in a log, repo, image, or CI artifact.
- Cloud provider or KMS vendor notifies us of key or account compromise.

## Roles

| Role | Owns |
|---|---|
| Incident lead | Declares the incident, owns the timeline, makes the pause call |
| Signer owner | KMS policy changes, key disable, rotation |
| Chain owner | Root registry pause, multisig coordination |
| Verifier owner | Corpus re-verification, fork analysis |
| Comms owner | Player-facing status, disclosure |

One person may hold several roles. The pause call is never blocked on availability: if the incident
lead is unreachable, the signer owner pauses.

## Phase 1: contain (target: 15 minutes)

Order matters. Stop the bleeding on-chain first, because that is the only irreversible surface.

1. **Pause the on-chain surfaces.** Emergency pause on the root registry and the claim contract. No
   new roots accepted, no claims processed. This is the only step that prevents economic loss.
2. **Disable the suspect key in KMS.** Deny all signing operations on that key version. Do not delete
   the key and do not delete its public record, which is needed for later verification.
3. **Stop receipt signing.** Trip the signer circuit breaker. Battles already `committed` stay in
   `verified` and are not lost. Battle acceptance also stops, since acceptance requires a signed
   commitment and an unsigned acceptance would break invariant 1.
4. **Snapshot evidence.** KMS audit logs, signer access logs, ledger tables, published corpus, and
   the current chain tips of all three receipt chains. Copy to write-once storage before anything is
   rotated or restored.
5. **Freeze deploys.** No code or infrastructure changes to the signer path until Phase 4.
6. **Declare the incident** and record the suspected compromise window opening time. When unknown,
   use the earliest plausible time, not the most convenient one.

## Phase 2: assess (target: 4 hours)

Establish the compromise window and what was signed inside it.

1. **Reconcile KMS to ledger.** For every signing request in the window, match the digest to a ledger
   row. Unmatched digests are forged-signature candidates and define the real window.
2. **Reconcile corpus to ledger.** Every published receipt and commitment must have a ledger row with
   the same payload. Extra corpus entries mean forged artifacts were served.
3. **Run the verifier over the window.** `verifier` over the affected sequence range. Failures split
   into: signature invalid, beacon invalid, replay mismatch, chain discontinuity. Replay mismatch on
   an otherwise valid signature is the strongest evidence of forgery, because our pipeline cannot
   produce it.
4. **Walk the chains.** Global chain and the per-pet chains for every pet touched in the window. Note
   every fork point and both branches. A fork with two valid signatures is provable equivocation and
   must be preserved exactly as found.
5. **Check batches.** Which anchored roots include window receipts. Which of those had claims against
   them. Compute worst-case economic exposure against the caps.
6. **Classify.** Confirmed compromise, suspected, or false alarm. A false alarm exits at Phase 4 with
   the pause lifted and a post-incident note. Do not skip Phase 4.

## Phase 3: rotate and recover

Only after the window is bounded.

1. **Generate a new key** in a fresh KMS key with a new `signingKeyId`. New credentials, new
   principal, minimal network path. Never reuse the old principal.
2. **Publish the key registry update.** New key with its `notBefore`. Old key marked compromised with
   its validity end set to the window opening time, and **retained**, because historical receipts
   still verify against it. Never remove a rotated-out key from the registry.
3. **Publish the compromise window** as a first-class record: `signingKeyId`, window start and end,
   affected sequence ranges, and the list of receipts we attest to as pipeline-produced. Players and
   third-party verifiers need this to interpret their own copies.
4. **Do not re-sign history under the new key.** Re-signing changes nothing about what happened and
   destroys the evidence trail. Instead publish an attestation list: the receipt hashes we confirm
   our pipeline produced, signed with the new key. Verifiers then treat an in-window receipt as valid
   only if it appears in the attestation list.
5. **Do not renumber sequences.** Gaps and forks stay visible. Continue the chain from the last
   attested receipt, recording the discontinuity explicitly.
6. **Handle in-flight battles.** Battles in `verified` at pause time resolve normally under the new
   key. Battles in `committed` whose round has published resolve normally. Battles whose committed
   round has passed the beacon timeout become `forfeited` with no progression change.
7. **Reverse or freeze bad claims.** Claims against forged inclusion stay paused. Nullifiers already
   consumed cannot be reused, so genuine claimants inside a poisoned batch need a re-issued batch
   under a new root rather than a retry.
8. **Lift the pauses** in the reverse of Phase 1: signer, then acceptance, then root registry, then
   claims. Claims last, because they are the only irreversible surface.

## Phase 4: post-incident

- Timeline with detection latency, containment latency, and every decision point.
- Which detection fired, and which should have fired first. If detection came from a player, that is
  the headline finding.
- Whether reward caps bounded the exposure as designed. If not, lower the caps before resuming.
- Whether the escalation threshold in the threat model §6 has been reached.
- Public disclosure: what was signed, what was attested, what players should check themselves. The
  design's entire premise is that we publish our homework, so a compromise is disclosed with the same
  detail we would want if we were the player.

## Never do these

- Delete or unpublish an old public key. Historical verification depends on it.
- Delete a forged receipt from the corpus without recording it. The fork is the evidence.
- Re-sign or rewrite historical receipts under the new key.
- Renumber sequences or repair a chain by regenerating links.
- Substitute a different drand round for an unresolved battle, even to clear the queue. That breaks
  invariant 2 and is exactly the behaviour T1 is designed to make impossible.
- Restore Postgres to a point before the published corpus without reconciling against it (T19).

## Drill

Run this as a live drill in Phase 3 of the implementation plan, before anything of value is at stake
(Step 36). The drill must cover: pause, key disable, evidence snapshot, corpus reconciliation,
verifier run over a range, rotation with registry publication, attestation-list publication, and
resumption. Record the wall-clock time of each phase and correct the targets above to what the drill
actually achieves.
