# indexer-go

Unified cross-chain indexer for Cryptopets (see `plan-unified-indexer.md` at
the repo root). **New to Go or to this codebase? Start with
[ARCHITECTURE.md](./ARCHITECTURE.md)** — a beginner-friendly tour of every
package and the Go concepts behind them. One Go binary, two chain adapters behind the `ChainIndexer`
interface — Solana push (WebSocket subscriptions + backfill) and EVM pull
(subgraph watermark polling) — feeding a single version-guarded writer into
the Prisma-owned Postgres, plus a `StreamLiveBattles` gRPC push to the Node
backend.

## Build & test

```powershell
go vet ./...
go test ./...                      # unit tests; no network, no database
go build -o bin\indexer.exe .\cmd\indexer
go build -o bin\diff.exe .\cmd\diff
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
| `EVM_SUBGRAPH_URL` | The Graph query endpoint (needs the `Battle` entity deployed) |
| `SOLANA_WS_URL` / `SOLANA_RPC_URL` / `SOLANA_PROGRAM_ID` | Helius endpoints + program id |
| `GRPC_ADDR` | StreamLiveBattles bind address (default `localhost:50051`) |
| `EVM_POLL_INTERVAL` / `RECONCILE_INTERVAL` | pull tick / reconciliation scan |

Prereq migrations (from `backend/`): `npx prisma migrate dev` — adds
`pet_roster.last_version` and `battle_history.version`.

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
the gap on wake, and the Node indexers stay the source of truth until
promotion. Connection env vars are set in the Render dashboard.

## Read cache (milestone 8)

`ROSTER_CACHE_ENABLED=true` serves `GetPetState` / `ListReadyOpponents` from a
write-through RAM copy of `pet_roster`: warmed from the table at startup,
updated commit-then-cache by the single writer, version-guarded like the SQL.
**Coherent only while indexer-go is the sole writer of the table** — enable at
promotion, never during shadow mode. Reads return `UNAVAILABLE` until warm.

Node side: `ROSTER_READ_SOURCE=grpc` routes the matchmaking query through the
cache with a 50ms deadline, a 3-failure/30s circuit breaker, and automatic
Prisma fallback on any error — killing indexer-go must never take reads down
(verified: 5 reads against a dead process fail open in ~30ms total).

## Shadow mode (milestone 7 runbook)

Goal: prove indexer-go writes exactly what the Node indexers write before
promoting it to source of truth. Blockers gate on `cmd/diff` exit code.

1. **Provision a shadow database** — second Postgres (or second database on
   the same server). Apply the same Prisma migrations to it:
   `DATABASE_URL=<shadow> npx prisma migrate deploy` from `backend/`.
2. **Run indexer-go against the shadow DB** with real devnet sources:
   `DATABASE_URL=<shadow>`, `EVM_SUBGRAPH_URL`, `SOLANA_*` set. The Node
   backend keeps running its own indexers against the primary DB, untouched.
3. **Generate traffic** — mints/battles via the app UI or a devnet script.
4. **Diff regularly** (cron/scheduled task):

   ```powershell
   .\bin\diff.exe -source <primary-db-url> -shadow <shadow-db-url>
   ```

   - exit 0 `CLEAN` — gate passes for this run
   - exit 1 — diffs found; categories in the output:
     - `MISSING IN SHADOW` / `FIELD MISMATCHES` — indexer-go bug, fix first
     - `WINNER MISMATCHES` — client-reported result contradicts chain truth
       (integrity finding, not an indexer bug)
     - `EXTRA IN SHADOW` — usually indexer-go seeing fresher state; verify
5. **Promote chain-by-chain** (EVM first — simpler lane) once diffs stay
   clean across a soak period with real traffic:
   - point indexer-go's `DATABASE_URL` at the primary DB
   - disable that chain's Node indexer via its env (`INDEXER_ENABLED` /
     chain-specific settings)
   - set `INDEXER_GRPC_ADDR` on the backend so the battle stream + chain-truth
     verification go live (`[dialogue]` warnings on client/chain mismatches)
   - the Node periodic re-scan stays available as the rollback path until
     decommission (disable first, delete code weeks later)

## Layout

```
cmd/indexer/        binary: adapters + writer + gRPC, or -scan-once
cmd/diff/           shadow-mode diff (promotion gate)
internal/indexer/   ChainIndexer contract + pipeline types
internal/evm/       subgraph watermark adapter (pets + battles)
internal/solana/    WS push adapter, Borsh decode, reconnect/backfill
internal/store/     single version-guarded batch writer (pgx)
internal/battlebus/ fan-out to gRPC stream subscribers
internal/grpcsrv/   StreamLiveBattles server
internal/shadowdiff/ diff core (pure, unit-tested) + loaders
pb/                 generated stubs (buf generate ../proto)
```
