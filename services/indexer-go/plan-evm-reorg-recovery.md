# EVM reorg recovery: the open item, and the trap in the obvious fix

Design note for the last open piece of the roadmap's §3. Not implemented; written so the
decision can be made from facts rather than from a sketch. The Solana half of this
shipped (`SOLANA_COMMITMENT=finalized`), and the periodic EVM reconcile scan shipped, but
neither closes what follows.

## The failure

The Graph is the parsing layer and rolls back reorged blocks itself. When it does, a
pet's `updatedAt` **decreases**: it is `event.block.timestamp` (see
`contracts/ethereum/subgraph/src/mapping.ts`), so a rolled-back update leaves the entity
stamped with an earlier block's time.

Two independent things then stop us from ever correcting the row:

1. **The incremental query cannot see it.** `sync` asks for `updatedAt_gt: watermark`.
   The watermark is already above the corrected value, so the row is never returned
   again — not on the next tick, not ever, until some later on-chain change pushes it
   back above the watermark.
2. **The writer would reject it anyway.** The upsert guard is
   `WHERE last_version <= EXCLUDED.last_version`, and the corrected version is lower.

The periodic reconcile scan fixes (1) and not (2): the sweep re-reads the row, hands it
to the writer, and the writer discards it. So the stale value survives, and the only
thing that clears it is an unrelated future update to the same pet.

Impact is not cosmetic. `pet_roster` is what backend battle snapshots are frozen from, so
a stale row can be frozen into a signed receipt that replays forever
(`docs/battle-protocol.md` Appendix A, threat T10) — the same argument that moved Solana
to `finalized`.

## The trap: do not switch `Version` to a block number

The tempting fix for (2) is a version that never moves backwards, and the obvious
candidate is the subgraph head block number. **This would silently break all EVM
indexing.**

Measured against the live database:

| chain | `pet_roster.last_version` | what it is |
| --- | --- | --- |
| `evm` | ~1.786 × 10⁹ | Unix seconds (`block.timestamp`) |
| `solana` | ~4.76 × 10⁸ | slot number |

Base Sepolia block numbers are around 3 × 10⁷ — roughly sixty times smaller than the
timestamps already stored. Every subsequent write would carry a version far below
`last_version`, the guard would reject all of them, and **the service would look
perfectly healthy while writing nothing**: polls succeed, `indexer_last_poll_unixtime`
advances, `/readyz` passes, `indexer_flush_errors_total` stays flat, because a
guard-rejected upsert is not an error.

Any change to what `Version` means for EVM therefore requires a coordinated reset of
`pet_roster.last_version` for EVM rows, on a live deployment, in the same change. That is
the part that makes this a decision rather than a patch.

## Option A (recommended): refuse to ingest entities that are too new

Add a lower bound in time to the existing queries: ignore any pet whose `updatedAt` is
within the last N seconds.

```graphql
pets(where: { updatedAt_gt: $since, updatedAt_lte: $safeUntil }, ...)
```

with `safeUntil = now - reorgDepth`.

Why this one:

- **It prevents the bad write instead of recovering from it**, which is what we chose for
  Solana. A row that never enters the table cannot be frozen into a snapshot.
- **`Version` keeps its meaning**, so there is no migration and no trap above.
- It is a filter on the query already being issued — no `_meta` lookup, no Graph
  time-travel queries (`block: { number: X }`), and so no dependence on the subgraph
  retaining history, which a pruned deployment does not.
- `updatedAt` is already a timestamp, so "confirmation depth" expresses naturally in
  seconds. Block-depth would have to be converted anyway.

Costs, stated plainly:

- Every EVM pet update is delayed by `reorgDepth`. This is the same trade accepted on
  Solana, and matters less to an opponent list than a phantom row does — but it is a real
  latency regression for anything reading the roster right after a transaction.
- Clock dependence: `now` is the indexer's clock against the chain's block timestamps.
  Skew eats into the margin, so the depth should comfortably exceed plausible skew.
- It does not repair rows already stale from a past reorg. Those need one full sweep with
  the guard bypassed, or a targeted reset — a one-off, not part of the steady state.

Suggested shape: `EVM_REORG_DEPTH`, default something like 120s for Base, validated at
startup like `SOLANA_COMMITMENT`, and applied to both `sync` and `Scan` so a reconcile
sweep cannot reintroduce what the incremental path refused.

## Option B: make `Version` monotonic

Use the subgraph head block number (via `_meta { block { number } }`) as the version for
every row in a fetch, so a later fetch always outranks an earlier one and corrections
apply.

This does close the loop when paired with the reconcile scan — but it carries the
migration hazard above, weakens the guard's protection against genuinely stale writes
(all rows in a batch share a version), and leaves the window open in which a bad value is
written and then corrected, which is precisely the window a snapshot can be taken in.

## Recommendation

Option A, with the depth configurable and defaulted conservatively; leave `Version` alone.
Treat the historical-stale-row cleanup as a separate one-off. Do not adopt Option B
without a `last_version` reset in the same deployment.
