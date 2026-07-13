# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

The import above pulls in the cross-tool non-negotiables and command baseline from [AGENTS.md](./AGENTS.md), shared with other coding agents (Cursor, Codex, etc.). Everything below is Claude Code specific.

## What this is

`do-not-stop` (product name **cryptopets**) is a pnpm monorepo for a Web3 pet-battling game deployed on both Ethereum (Hardhat/Sepolia) and Solana (local validator/devnet). Live demo: https://cryptopets.vercel.app.

## Working Guidelines

**Think before coding.** State assumptions explicitly rather than silently picking between interpretations. If a request is ambiguous, or a simpler approach exists than the one implied, say so before implementing, especially around the chain-parity and licensing boundaries documented below, where a wrong guess is expensive to unwind.

**Simplicity first.** No speculative abstractions, no unrequested configurability, no error handling for scenarios that can't occur at the call site. If a change could be half the size, make it that size.

**Surgical changes.** Touch only what the task requires; match each file's existing style even where you'd choose differently. When your edit makes an import, variable, or function unused, remove it, but leave pre-existing dead code alone and just flag it. Never drive-by "fix" one leg of the combat simulator (Solidity/Rust/Go/TS) without updating the other three and rerunning the golden vectors (see Architecture).

**Goal-driven execution.** For multi-step work, state a short plan with a verification step per item, e.g. "port fix to indexer-go, then verify with `go test ./internal/combat -run TestName` against the golden vector." Use the smallest per-package command from the table below that actually exercises the change, not the whole suite, unless the change is broad.

**Loops and autonomy.** "Done" means the relevant command from the table above passes, not "looks right." Work on a branch so changes are easy to revert. Autonomous or `/loop`-driven runs need an explicit stop condition (a passing test, a clean lint run) and an iteration cap; don't loop indefinitely on judgment calls like game-balance tuning or design decisions, those are a human call. If you hit the cap or get stuck, stop and report what you tried and what's blocking, rather than thrashing or guessing further.

**Text.** In commit messages, PR descriptions, and docs written for this repo: no em-dashes, no filler ("it's worth noting," "essentially"), no LLM tells ("it's not just X, it's Y," "delve"). Reread before finishing and cut anything that doesn't earn its place.

**Commit messages.** After any set of file changes, automatically draft and show a Conventional Commits message (`feat:`, `fix:`, `docs:`, `chore:`, etc., matching this repo's history) in a copyable code block, without waiting to be asked. Scope it to the actual uncommitted change set (check `git status`) and call out any unrelated modified files so they can be excluded. Do not run `git commit` yourself; the user commits manually unless they explicitly ask you to.

## Commands

Run from repo root unless noted. Package manager is **pnpm** (`packageManager: pnpm@9.15.9`).

### Install / dev
```bash
pnpm install                 # root only
pnpm install:all             # root + frontend + website + backend + mobile + contracts/ethereum
pnpm dev:fe                  # frontend only
pnpm dev:be                  # backend only
pnpm dev:mobile              # mobile only
pnpm dev:web                 # website only
pnpm eth:node                # local Hardhat network
pnpm eth:deploy              # deploy contracts to it
pnpm sol:docker               # start Solana validator (docker-compose)
pnpm sol:inject-ngrok         # tunnel local Solana RPC for mobile/device testing
pnpm fe:eth:local            # HH node + deploy + VRF watcher + backend + frontend, concurrently
pnpm mobile:eth:local        # same, with mobile instead of frontend
pnpm fe:sol:local            # backend + frontend + Solana docker/ngrok, concurrently
```
> `pnpm eth:deploy` and `pnpm eth:vrf:watch` currently reference `deploy:inject` and `vrf:watch` scripts that **no longer exist** in `contracts/ethereum/package.json` (that package was refactored to `scripts/deploy.ts` plus Hardhat Ignition). If these fail, deploy directly with `pnpm --prefix contracts/ethereum deploy` (or `deploy:sepolia` / `deploy:base-sepolia`) instead of chasing the root wrapper script. `DEVELOPMENT.md` and `contracts/ethereum/README.md` also document a few commands (`pnpm dev`, `pnpm clean`, `pnpm vrf:watch`) that don't exist in the current root/package scripts, so treat those docs as partially stale and trust `package.json` scripts blocks over prose.

### Lint / test / build (root aggregates)
```bash
pnpm lint                    # frontend lint:check + @shared/core lint + website lint + mobile lint
pnpm lint:fix
pnpm test                    # equals contracts/ethereum test (Hardhat/Mocha), NOT a full monorepo test run
pnpm build                   # compile contracts + build backend + frontend + website
```
**`pnpm lint` and `pnpm test` do not cover every package.** `backend` has no lint script at all, and neither `backend` nor `contracts/ethereum` are in the root `lint` aggregate. Run per-package commands below when touching those.

### Per-package commands
| Package | lint | test | build | single test |
|---|---|---|---|---|
| `frontend` | `pnpm --filter frontend lint:check` (`eslint . --max-warnings 0` + CSS naming check) | `pnpm --filter frontend test` (vitest) | `pnpm --filter frontend build` (`tsc -b && vite build`) | `pnpm --filter frontend exec vitest run <path>` or `-t "<name>"` |
| `backend` | *(none)* | `pnpm --filter backend test` (vitest) | `pnpm --filter backend build` (`prisma generate && tsc`) | `pnpm --filter backend exec vitest run <path>` |
| `shared` (`@shared/core`) | `pnpm --filter @shared/core lint` | `pnpm --filter @shared/core test` (vitest) | *(none, consumed as raw TS)* | same vitest pattern |
| `mobile` | `pnpm --filter mobile lint` | `pnpm --filter mobile test` (jest) | *(none, RN, use `android`/`ios` scripts)* | `pnpm --filter mobile exec jest <path>` or `-t "<name>"` |
| `website` | `pnpm --filter website lint` (`next lint`) | *(no test script)* | `pnpm --filter website build` | n/a |
| `contracts/ethereum` | *(none)* | `pnpm --prefix contracts/ethereum test` (`pnpm hh test`) | `pnpm compile` (`pnpm hh compile --force`) | `pnpm --prefix contracts/ethereum hh test test/<File>.test.ts` |
| `contracts/solana/cryptopets` | n/a | Anchor test suite (see package README) | `anchor build` | n/a |
| `indexer-go` | `go vet ./...` | `go test ./...` (unit only; Postgres tests are gated on `TEST_DATABASE_URL` and **truncate tables**, scratch DB only) | `go build -o bin/indexer ./cmd/indexer` | `go test ./internal/combat -run TestName` |

`*_test:coverage` scripts exist for frontend/backend/shared (`vitest run --coverage`); CI runs these in `.github/workflows/coverage.yml` and posts a combined PR comment. Coverage requires `@vitest/coverage-v8` to match the installed `vitest` major version, or coverage collection breaks repo-wide.

## Architecture

### Component map
| Component | Stack | Role |
|---|---|---|
| `frontend` | React 19, Vite, Wagmi, Viem, TanStack Query | Web app, wallet integration |
| `backend` | Node.js, Express, TypeScript, Prisma, JWT | REST + GraphQL + gRPC API server, plus the settle keeper (async battle/breed/mint settlement) |
| `mobile` | React Native | Cross-platform client |
| `website` | Next.js | Marketing/docs site |
| `indexer-go` | Go | Optional cross-chain indexer (EVM pull + Solana push) |
| `contracts/ethereum` | Solidity, Hardhat | EVM contracts + subgraph |
| `contracts/solana/cryptopets` | Rust, Anchor | Solana programs |
| `shared` (`@shared/core`) | TypeScript | Common utils/types/hooks, consumed as raw TS (no build step), shared by frontend + mobile |
| `proto` | Protobuf/Buf | gRPC contract (`GameDataService`) between `indexer-go` and `backend` |

### Data flow
On-chain events (EVM via subgraph watermark polling, Solana via WebSocket push + backfill) are mirrored into Prisma-owned Postgres (`pet_roster`, `battle_history`) by **two parallel indexers**: the backend's built-in Node `RosterIndexer`, and the optional Go `indexer-go`. The Node indexer is the source of truth in local dev; `indexer-go` is promotable later and can additionally stream settled battles straight to the backend over gRPC (`StreamLiveBattles`, defined in `proto/cryptopets.proto`). If `indexer-go` is down, the backend circuit-breaks back to reading Postgres directly (`ROSTER_READ_SOURCE` env var controls `grpc` vs `postgres`). Frontend, mobile, and website all talk to the backend via REST + GraphQL; none of them read chain state directly. See `docs/architecture.md`, `backend/API.md`, `indexer-go/README.md`.

Note: `docs/README.md` and `docs/architecture.md` link to `indexer-go/ARCHITECTURE.md`, which doesn't exist. The real doc is `indexer-go/README.md`.

### No shared cross-chain interface: logic is duplicated per chain, deliberately
There is **no** shared TypeScript abstraction that both chains implement. `frontend/src/chains/ethereum/` (wagmi + in-tree ABI JSONs: `combatSimAbi.json`, `gameConfigAbi.json`, `gameLogicAbi.json`, `petCoreAbi.json`) and `frontend/src/chains/solana/` (Anchor wallet/provider/signer) sit side by side and are wired independently. Don't assume a generic `ChainAdapter`-style interface exists in `shared/`; check the concrete chain directory instead.

### Combat simulator is ported four times: golden vectors keep them in sync
The battle/combat logic is implemented independently in `contracts/ethereum/src/CombatSim.sol`, Solana's `combat.rs`, pure Go in `indexer-go/internal/combat/`, and pure TypeScript in `shared/src/utils/combat/` (the fourth port, added for client-side live battle replay — see `docs/plan-realtime-battle-impl.md` Phase 3). All four are validated against the same golden test vectors at `contracts/test-vectors/{battle,xp}.json`, run by Hardhat, Anchor, `combat_golden_test.go`, and `shared`'s `tests/utils/combat/goldenVectors.test.ts` respectively. Hashing uses **legacy Keccak-256** (`keccak256(abi.encodePacked(...))` byte layout); a SHA3-vs-Keccak mismatch fails every vector. The TS port covers fight math only, not XP (`xp.go`'s equivalent isn't ported): XP depends on on-chain same-opponent streak state the client can't know, and `BattleResolved` already carries `xpWin`/`xpLoss`.
**If a golden vector test fails, the Go, Rust, or TS implementation has drifted from the Solidity contract. Fix the drifted port, never edit the vector.**

### Settle keeper: the second EVM battle/breed/mint transaction isn't the player's
`GameLogic`'s async flows (`requestBattle`/`requestCreateFromDNA`/`requestMintStarter` → Pyth Entropy reveals → `settleX`) used to have the frontend send the settle transaction itself, meaning two wallet prompts per action even though settle is permissionless. A backend service, `backend/src/features/settle-keeper/`, now watches Pyth Entropy's `Revealed` event and sends the settle transaction from its own wallet; the frontend only falls back to prompting the player if the keeper hasn't settled within ~45s (keeper outage or not configured — see `useEvmBattleFlow.ts`'s `FALLBACK_SETTLE_DELAY_MS`). Gated by `KEEPER_ENABLED` (off by default); see `backend/env.example` for the full var list. This fixes only the double-signature UX; the related security fix — `requestBattle` snapshotting sim inputs so a level-up between request and settle can't reroll a committed battle — already lives in `GameLogic.sol` itself. See `docs/plan-realtime-battle-ux.md` / `docs/plan-realtime-battle-impl.md` for the full design and threat model.

### Entropy / randomness
All three async EVM flows — battle (`requestBattle`), breed (`requestCreateFromDNA`), and
starter mint (`requestMintStarter`) — use Pyth Entropy v2 (`requestV2` → `entropyCallback`
stores the revealed word only → a separate permissionless settle call runs the actual logic).
This has already fully replaced the Chainlink VRF and predictable `Utils.randMod`
(keccak-of-timestamp) schemes that older revisions of `contracts/plan-contract-upgrade.md`
describe as the v1 baseline still to be migrated — there is no `Utils.sol`, no Chainlink
dependency, and no `randMod` anywhere in `contracts/ethereum/src` today; treat that plan doc's
"current state" tables as historical, not current, and trust the contract source instead.
Locally there's no live Pyth network, so Hardhat tests deploy `MockEntropy` and reveal manually
(`entropy.mockReveal(...)`); the settle keeper's `KEEPER_MOCK_REVEAL` flag (see above) does the
same thing for a running local node, replacing the old `vrf-fulfill-watcher.ts` script for this
flow (see the stale-script note in Commands above).
Solana breeding uses Switchboard On-Demand (commit then settle), also async.

### Known v1 contract limitations (design context, not regressions to "fix")
`contracts/plan-contract-upgrade.md` documents intentional v1 gaps that v2 is designed around: no battle authorization (anyone can call `battle()`/`attack()` on anyone's pets), an EVM `changeDna` cheat that lets a level-20 pet set arbitrary DNA, and a Solana `create_starter_pet` that accepts client-supplied dna/rarity. v2 plan: EVM moves to UUPS proxies (`PetCoreProxy` + `GameLogicProxy`, with `CombatSimV1` deployed as a separate contract to stay under the 24KB bytecode ceiling); Solana adds versioned/reserved-space accounts and migrates pets to Metaplex Core NFTs. This is a plan doc; check current contract source before assuming any of it is implemented.

### Hardhat specifics worth knowing
- Contract sources live in `contracts/ethereum/src/` (not `contracts/`): `PetCore.sol`, `GameLogic.sol`, `GameConfig.sol`, `CombatSim.sol`, `DnaLib.sol`, `TestDeployer.sol`.
- Both compiler profiles (`default` and `production`) are pinned to `viaIR` explicitly. Hardhat Ignition silently drops viaIR/optimizer settings from a flat config, and `CombatSim.sol` hits "stack too deep" without it.
- The `localhost` network hardcodes the 5 standard Hardhat dev private keys; only live networks (Sepolia, Base Sepolia, see `scripts/networks.ts`) read `PRIVATE_KEY` from env.
- Deployment is Hardhat Ignition-based (`ignition/modules/CryptoPetsV2Live.ts`); use `pnpm --prefix contracts/ethereum deploy:status` / `deploy:visualize` to inspect.

### Solana local setup
`contracts/solana/docker-compose.yml` runs two services: `solana-dev` (the validator itself, ports 8899/8900/9900) and an **ngrok tunnel** service exposing the local RPC (needs `NGROK_AUTHTOKEN`, ngrok web UI on 4040). This is how mobile/on-device testing reaches a local validator (`pnpm sol:inject-ngrok`), and it isn't documented in `DEVELOPMENT.md`.

### indexer-go internals
Two chain adapters (Solana WS push, EVM subgraph pull) behind a `ChainIndexer` interface feed a single version-guarded pgx batch writer into Postgres, plus a gRPC push path. Layout: `cmd/indexer` (binary, supports `-scan-once`), `internal/{indexer,evm,solana,store,combat,battlebus,grpcsrv}`, `pb/` (buf-generated). An optional in-memory read cache (`ROSTER_CACHE_ENABLED`) is write-through and version-guarded; it's only coherent while `indexer-go` is the sole writer, so it should stay off during shadow-mode (dual-indexer) operation and only be enabled at promotion.

### Auth
Backend auth is nonce, then wallet-signature, then JWT (`backend/README.md`), guarding a single `/graphql` endpoint; the authenticated wallet becomes the matchmaking `caller` context (`backend/API.md`). Roster/battle reads are read-only projections of what the indexer(s) wrote; the backend no longer decodes contract events itself. `winEstimate` returns `null` (not an error) when unavailable, so treat that as a degraded UI state, not a failure.

### Testing conventions
See `docs/testing.md` for the full per-package suite table. Test work is expected to land on dedicated branches per test type/area (e.g. `test/frontend-modules`), not mixed into feature branches, with coverage reported after each change.

## Licensing

This monorepo has split licensing; see the table in `README.md`. `contracts/ethereum`, `contracts/solana`, `indexer-go`, and `proto` are MIT; everything else (`frontend`, `backend`, `mobile`, `website`, `shared`) is PolyForm Noncommercial 1.0.0 (root `LICENSE`). Match the license of whichever package you're editing when adding new files.
