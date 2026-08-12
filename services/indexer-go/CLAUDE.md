# services/indexer-go

Moved out of the root `CLAUDE.md` so it loads only when working in this directory.
Universal rules and the cross-chain non-negotiables stay in the root file and `AGENTS.md`.

## indexer-go internals
Two chain adapters (Solana WS push, EVM subgraph pull) behind a `ChainIndexer` interface feed a single version-guarded pgx batch writer into Postgres. Layout: `cmd/indexer` (binary, supports `-scan-once`), `internal/{indexer,evm,solana,store,combat,grpcsrv}`, `pb/` (buf-generated). It indexes the roster only: the battle pipeline (`battlebus`, `BattleEvent`, `InsertBattles`) is gone, and `battle_history` is written by the backend from signed receipts. An optional in-memory read cache (`ROSTER_CACHE_ENABLED`) is write-through and version-guarded; it's only coherent while `indexer-go` is the sole writer, so it should stay off during shadow-mode (dual-indexer) operation and only be enabled at promotion.
