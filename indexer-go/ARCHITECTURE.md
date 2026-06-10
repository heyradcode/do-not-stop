# indexer-go — A Beginner-Friendly Tour

> A guide for readers who know TypeScript/Node but are new to Go.
> The technical runbook lives in [README.md](./README.md); the design history
> in [`plan-unified-indexer.md`](../plan-unified-indexer.md).

## What this program is

Think of the indexer as a **little factory** with one job:

> *Watch two blockchains, and keep a notebook (PostgreSQL) up to date with
> every pet and every battle — then tell the Node backend the moment a battle
> settles.*

Every folder is one room in that factory.

```
indexer-go/
├── cmd/                ← the ON buttons (each folder = one runnable program)
│   ├── indexer/        ← the main power switch
│   └── diff/           ← a hand-held inspector robot
├── internal/           ← the factory rooms (compiler-enforced "private")
│   ├── indexer/        ← the rulebook every chain-worker follows
│   ├── evm/            ← worker #1: ASKS Ethereum for news (polling)
│   ├── solana/         ← worker #2: LISTENS to Solana live (WebSocket)
│   ├── store/          ← the librarian — sole writer of the notebook
│   ├── cache/          ← a whiteboard copy of the notebook (RAM reads)
│   ├── battlebus/      ← a megaphone for battle announcements
│   ├── grpcsrv/        ← the telephone desk (gRPC to the Node backend)
│   ├── shadowdiff/     ← the inspector robot's brain
│   ├── metrics/        ← gauges on the wall (/metrics)
│   └── config/         ← the settings sheet (reads env vars)
├── pb/                 ← auto-generated gRPC code (never edit by hand)
├── buf.gen.yaml        ← recipe for regenerating pb/ from ../proto
├── go.mod              ← the project's name tag + dependency list
└── go.sum              ← the lockfile (integrity hashes)
```

The whole flow in one sentence:

> **Two workers watch the chains → drop notes onto a conveyor belt → one
> librarian writes the notebook and whiteboard → the telephone desk tells the
> backend about battles, instantly.**

---

## The rooms, one by one

### `cmd/` — the ON buttons

Go convention: every sub-folder of `cmd/` compiles to one executable.

| Program | What pressing it does |
| --- | --- |
| `cmd/indexer` | Runs the whole factory: starts both chain workers, the librarian, the telephone desk, and the health/metrics page. Also has a `-scan-once` mode: sweep everything once, write it, exit (used for backfills). |
| `cmd/diff` | Compares two notebooks — the one written by the old Node indexers and the one written by this factory — and shouts about any difference. This is the promotion gate for shadow mode. |

### `internal/` — the private rooms

`internal` is a magic folder name: the Go **compiler refuses** to let any
other project import what's inside. It's a door sign saying *factory workers
only*, enforced by the language itself. The only public ways into this
factory are the telephone (gRPC, contract in `../proto/cryptopets.proto`)
and the notebook (the database, schema owned by `backend/prisma`).

### `internal/indexer` — the rulebook (start reading here)

One ~50-line file, `types.go`. It says: a chain-worker must know how to do
exactly two things:

```go
type ChainIndexer interface {
    Chain() string
    Scan(ctx, roster) (int, error)   // sweep EVERYTHING once
    Run(ctx, roster, battles) error  // keep watching forever
}
```

Both workers pinky-promise to follow this rulebook (in Go terms: they
*implement the interface*). That's why the main switch never needs to know
which chain is which — adding a third chain means writing one new worker,
nothing else changes. (This mirrors `backend/indexing/types.ts` — the same
contract, ported.)

It also defines the two kinds of notes workers can produce:
- `RosterUpdate` — one pet's full current state
- `BattleEvent` — one settled battle

Every note carries a **version number** (Solana slot / subgraph timestamp).
Remember it — it's the trick that makes the whole factory safe.

### `internal/evm` — the worker who ASKS

Ethereum news comes from The Graph (the same subgraph the Node indexer
uses). This worker checks the mailbox every 15 seconds: *"anything new since
timestamp X?"* Quiet days cost one cheap question. It's a direct Go port of
`backend/indexing/evm/indexer.ts`, kept query-for-query identical so the two
can be diffed during shadow mode.

### `internal/solana` — the worker who LISTENS

Solana news arrives on an always-open phone line (WebSocket subscriptions
via Helius). This worker holds the phone to their ear all day:

- `programSubscribe` → a pet changed; the message contains the pet's whole
  new state, so nothing needs to be re-asked
- `logsSubscribe` → a battle settled; decode the result from the logs

The hard (and most valuable) part is what happens when the line drops:
**redial with increasing patience** (backoff), then ask *"what did I miss?"*
(a full re-scan for pets + a signature sweep for battles). A slow timer also
re-checks everything every 10 minutes, just in case.

### `internal/store` — the librarian (sole writer)

Both workers shout their notes into one hallway — a Go **channel**, which is
a typed conveyor belt between concurrent workers. Only the librarian takes
notes off the belt, and **only the librarian ever writes the notebook**.
One writer = pages can never be scribbled over each other = no ordering bugs.

Two safety habits:

1. **Batching** — notes pile up (64 max, or half a second, whichever first)
   and get written in one trip to the database instead of 64 trips.
2. **The version guard** — the SQL says *"only apply this if it's newer than
   what's already on the page"*:

   ```sql
   ... WHERE pet_roster.last_version <= EXCLUDED.last_version
   ```

   So replays, duplicates, and out-of-order arrivals are all harmless.
   You can feed the factory the same day twice and the notebook comes out
   identical (that's an actual test).

### `internal/cache` — the whiteboard

A RAM copy of the pet notebook, so the hottest question in the game —
*"which pets are ready to battle?"* — is answered instantly without touching
the database. It stays truthful by a simple rule: **the librarian updates
the whiteboard right after the notebook write succeeds, same hand, same
moment** (commit-then-cache). No expiry timers, no invalidation messages —
it can't drift because nobody else writes the table.

⚠️ That "nobody else writes" promise is only true *after* the old Node
indexers are switched off. Until then the whiteboard stays disabled
(`ROSTER_CACHE_ENABLED=false`).

### `internal/battlebus` + `internal/grpcsrv` — megaphone and telephone desk

When a battle settles, the megaphone (`battlebus`) announces it to everyone
listening inside the factory, and the telephone desk (`grpcsrv`) relays it
down the open line to the Node backend (`StreamLiveBattles`). The backend
uses it to start writing the AI battle dialogue *while the settle animation
is still playing*.

If a listener is too slow, the megaphone drops them — and the protocol's
answer is: reconnect and say *"replay everything after version X"*. The desk
re-reads missed battles from the notebook. The notebook is always the source
of truth; the megaphone is just the fast path.

The desk also answers two read questions from the whiteboard
(`GetPetState`, `ListReadyOpponents`) — and refuses politely
(`UNAVAILABLE`) when the whiteboard is off or still warming up, so the
backend silently falls back to its own database read. Killing this factory
must never break the game; that's tested.

### `internal/shadowdiff`, `internal/metrics`, `internal/config`

- `shadowdiff` — the inspector's brain: pure comparison logic (unit-tested),
  used by `cmd/diff`.
- `metrics` — counters and gauges served at `/metrics` in Prometheus format:
  notes per chain, write failures, redials, version lag, whiteboard state.
- `config` — reads every setting from environment variables in one place,
  mirroring the backend's `src/config/env.ts` convention.

### `pb/` — generated telephone vocabulary

Machine-written Go produced from the shared contract
`../proto/cryptopets.proto` by `buf generate`. Never edited by hand; CI
fails if it goes stale. The Node side reads the *same* proto file at
runtime, so both sides always speak the same language.

---

## Go survival guide (for TypeScript readers)

| Go thing | Nearest TS equivalent | The twist |
| --- | --- | --- |
| a folder | a module/file | **One folder = one package.** Files in the same folder see each other automatically; imports only happen *between* folders. |
| `go.mod` | `package.json` | First line is the project's name — the URL-shaped `github.com/radcrew/...` path. For our own folders it's just a prefix, nothing is downloaded. |
| `go.sum` | lockfile | Integrity hashes only. |
| goroutine | — | A worker that runs concurrently. Cheap; the factory runs ~10. |
| channel (`chan`) | — | A typed conveyor belt between goroutines. Our pipeline is literally two of them: `roster` and `battles`. |
| interface | TS interface | Satisfied **implicitly** — no `implements` keyword. If your struct has the right methods, it fits the rulebook. |
| `ctx context.Context` | `AbortSignal` | Threaded through everything; cancelling it is how the whole factory shuts down gracefully. |
| `if err != nil` | `try/catch` | Errors are ordinary return values, handled at every call site. Verbose, but no invisible exceptions. |
| `_test.go` files | `*.spec.ts` | Tests live next to the code they test, run by `go test ./...`. |
| `go build` | `tsc` + bundler + runtime | Squashes everything into **one self-contained `.exe`** — copy it to a server and run it. No runtime install, no `node_modules`. |

Note the dependency list in `go.mod`: essentially four items (Postgres
driver, WebSocket, gRPC, protobuf). HTTP server, JSON, crypto — all in Go's
standard library. That's typical Go.

## Where to start reading

1. `internal/indexer/types.go` — the rulebook (~50 lines)
2. `internal/evm/indexer.go` — the simplest worker, recognizable from its TS twin
3. `internal/store/writer.go` — the librarian: channels, batching, the version guard
4. `cmd/indexer/main.go` — how it all gets wired together and shut down
5. `internal/solana/indexer.go` — the deep end: reconnect/backfill machinery

Each step uses only ideas from the previous ones.
