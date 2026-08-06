# indexer-go

Unified cross-chain indexer for Cryptopets (see
[`plan-indexer-v2.md`](./plan-indexer-v2.md) for the design). One Go binary,
two chain adapters behind the `ChainIndexer`
interface — Solana push (WebSocket subscriptions + backfill) and EVM pull
(subgraph watermark polling) — feeding a single version-guarded writer into
the Prisma-owned Postgres, plus a gRPC read path for the Node backend.

It indexes the **roster only**. Battles left the chain in §L Phase 6, so there
are no settle events to decode; `battle_history` is written by the backend from
its own signed receipts. The `StreamLiveBattles` push and the whole `BattleEvent`
pipeline behind it are gone.

## Build & test

```powershell
go vet ./...
go test ./...                      # unit tests; no network, no database
go build -o bin\indexer.exe .\cmd\indexer
```

Postgres integration tests are env-gated (they TRUNCATE tables — scratch DB only):

```powershell
docker run --name cryptopets-test-db -e POSTGRES_PASSWORD=test -p 5433:5432 -d postgres
$env:TEST_DATABASE_URL = "postgresql://postgres:test@localhost:5433/postgres"
go test ./internal/store
```

## Configuration

Copy `.env.example`. Every setting is environment-driven; a chain with no
connection settings is skipped, so adapters roll out independently.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres (schema owned by `backend/prisma` — run migrations there first) |
| `EVM_SUBGRAPH_URL` | The Graph query endpoint (needs the `Pet` entity deployed) |
| `SOLANA_WS_URL` / `SOLANA_RPC_URL` / `SOLANA_PROGRAM_ID` | Helius endpoints + program id |
| `SOLANA_COMMITMENT` | `finalized` (default) or `confirmed`. See below before changing it. |
| `GRPC_ADDR` | GameDataService bind address (default `localhost:50051`) |
| `EVM_POLL_INTERVAL` / `RECONCILE_INTERVAL` | pull tick / reconciliation scan |

Prereq migrations (from `backend/`): `npx prisma migrate dev`. Beyond
`pet_roster.last_version` / `battle_history.version`, the v2 schema adds the
roster fields (`xp`, `generation`, `parent1_id`/`parent2_id`, `breed_count`,
`species_id`, `spouse_id`, `breed_ready_at`, `train_ready_at`, `asset`) and the
combat-sim battle fields (`loser_pet_id`, `seed`, `rounds`,
`winner_hp_remaining`, `xp_win`, `xp_loss`). All are defaulted, so the v1 Node
indexer keeps writing during shadow mode. **The writer is DML-only — run the
migration before pointing indexer-go at the database.** The EVM adapter also
expects the subgraph to expose the matching v2 Pet/Battle fields; until that
schema bump deploys, those fields decode to their zero values.

## Ops

- `indexer.exe -scan-once` — one full roster sweep per configured chain,
  write, exit. The Go counterpart of the backend's `index:once`.
- `GET /healthz` on `HEALTH_ADDR` (default `localhost:8090`; when `PORT` is
  set — Render's convention — it binds `0.0.0.0:$PORT` instead).
- `GET /metrics` (same port) — Prometheus text format: roster updates and
  battles per chain, flush count/rows/errors, WS reconnects, per-chain last
  version (lag), cache size/warm, stream subscriber count. The runbook
  signals: rising `indexer_flush_errors_total`, a flat `indexer_last_version`
  under traffic, or runaway `indexer_ws_reconnects_total`.

Deployment: `render.yaml` at the repo root defines `do-not-stop-indexer` as a
free-plan Go web service (`/healthz` checked, `/metrics` on the same port).
Free web services sleep when idle — the reconnect/backfill machinery recovers
the gap on wake. Connection env vars are set in the Render dashboard.

Note this service is now the **only** roster indexer: the backend's Node
`RosterIndexer` was deleted, so nothing else writes `pet_roster` and there is no
longer a shadow mode or a second source of truth to fall back on. A stalled
indexer-go means a stale roster, not a slower one.

## Solana commitment

`SOLANA_COMMITMENT` sets the commitment for every Solana read *and* the program
subscription, defaulting to `finalized`.

It used to be `confirmed` everywhere, which is the reorg exposure the roadmap's
indexing-hardening section names. A confirmed slot has a supermajority vote but can
still be dropped, and this roster is what backend battle snapshots are frozen from —
so indexing unfinalized state can freeze a value that never happened into a signed,
permanently replayable receipt (`docs/battle-protocol.md` Appendix A, threat T10).
That is a different class of problem from a stale opponent list.

The cost is roughly a dozen extra seconds of lag on pet updates. A local validator
finalizes almost immediately, so local development is unaffected. `confirmed` remains
available for an operator who has weighed the trade; anything else is refused at
startup rather than silently defaulted, and `processed` is refused outright because one
node having seen a slot is not an indexable claim about the chain.

Reads and the subscription always use the same value — a scan at one commitment and a
live stream at another would disagree about what is real, and the roster would flip
between them.

## Read cache (milestone 8)

`ROSTER_CACHE_ENABLED=true` serves `GetPetState` / `EstimateWin` from a
write-through RAM copy of `pet_roster`: warmed from the table at startup,
updated commit-then-cache by the single writer, version-guarded like the SQL.
**Coherent only while indexer-go is the sole writer of the table** — which it now
is, the Node indexer having been deleted, so the shadow-mode caveat this
originally carried no longer applies. Reads return `UNAVAILABLE` until warm.

Node side: `ROSTER_READ_SOURCE=grpc` routes the matchmaking query through the
cache with a 50ms deadline, a 3-failure/30s circuit breaker, and automatic
Prisma fallback on any error — killing indexer-go must never take reads down
(verified: 5 reads against a dead process fail open in ~30ms total).

## Combat sim (v2)

`internal/combat/` is a pure Go port of the on-chain round-based battle
simulator (`contracts/ethereum/src/CombatSim.sol` + the matching `combat.rs`)
— DNA→attribute derivation, the round loop with all 8 skill archetypes, the
XP + same-opponent-decay formulas, and `EstimateWin` (a seed-sampling pre-fight
win probability). It lets indexer-go replay a settled battle and serve odds
without an RPC simulation, surfaced over gRPC as `EstimateWin`.

Parity is enforced, not trusted: `combat_golden_test.go` consumes the shared
`contracts/test-vectors/{battle,xp}.json` — the *same* vectors the Hardhat and
Anchor suites run — so the Go is a third witness to one canonical result. The
hashing is **legacy Keccak-256** with the exact `keccak256(abi.encodePacked)`
byte layout; a SHA3-vs-Keccak slip would fail every vector. If a vector fails,
the Go has drifted from the contracts — fix the Go, never the vector.

## Independent verification for backend-authoritative battles (§F)

`internal/combat/verify.go` recomputes a backend-resolved battle from a frozen
snapshot and a verified drand seed, surfaced over gRPC as `VerifyBattle`
(`internal/grpcsrv/verify.go`): winner, rounds, winner HP, the full per-strike
log (`SimulateWithLog` in `simlog.go`), and the progression delta for both pets
(`progression.go`, which ported level-up from `PetCore.addXp` so this can check
the whole delta, not just the XP formula `xp.go` already covered).

This is release safety, not a trust boundary — see
`docs/battle-protocol.md` §F's "what the Go verifier is for"
before reusing it as anything stronger. The backend
(`backend/src/features/battle-worker/verify.worker.ts`) calls it, converts the
structured log back into `@cryptopets/protocol`'s `SimOutcome` shape, and hashes
it with the *real* canonical encoder — Go never reimplements that encoding
itself, so the only question this check answers is whether the two engines
computed the same strikes, never whether Go's encoding agrees with TS's (there
is only one canonical encoding, and it lives in `protocol/`).

`TestProgressionMatchesGoldenVectors` in `progression_test.go` consumes
`contracts/test-vectors/protocol-progression.json`, the same file
`protocol/tests/progression/vectors.test.ts` consumes, so the composition
around the formula (not just the formula itself) is cross-language locked too.

## Layout

```
cmd/indexer/        binary: adapters + writer + gRPC, or -scan-once
internal/indexer/   ChainIndexer contract + pipeline types
internal/evm/       subgraph watermark adapter (pets)
internal/solana/    WS push adapter, Borsh decode, reconnect/backfill
internal/store/     single version-guarded batch writer (pgx)
internal/combat/    pure Go combat sim + independent verify (cross-chain parity via golden vectors)
internal/grpcsrv/   GetPetState + EstimateWin + VerifyBattle server
pb/                 generated stubs (buf generate ../proto)
```
