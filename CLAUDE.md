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

**Commit messages.** After *every* response in which you change one or more files — not just at the end of a multi-step task, and not just when asked — automatically draft and show a Conventional Commits message (`feat:`, `fix:`, `docs:`, `chore:`, etc., matching this repo's history) in a copyable code block. This applies even to small, incremental edits (a single CSS tweak, a one-line fix) made in response to iterative follow-up requests, not only to larger logically-complete changes. Scope it to the actual uncommitted change set (check `git status`) and call out any unrelated modified files so they can be excluded. Do not run `git commit` yourself; the user commits manually unless they explicitly ask you to.

## Commands

Run from repo root unless noted. Package manager is **pnpm** (`packageManager: pnpm@9.15.9`).

### Install / dev
```bash
pnpm install                 # root only
pnpm install:all             # root + frontend + website + backend + mobile + contracts/ethereum
pnpm dev                     # backend + frontend (concurrent)
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
> `pnpm eth:deploy` and `pnpm eth:vrf:watch` currently reference `deploy:inject` and `vrf:watch` scripts that **no longer exist** in `contracts/ethereum/package.json` (that package was refactored to `scripts/deploy.ts` plus Hardhat Ignition). If these fail, deploy directly with `pnpm --prefix contracts/ethereum deploy` (or `deploy:sepolia` / `deploy:base-sepolia`) instead of chasing the root wrapper script. `DEVELOPMENT.md` and `contracts/ethereum/README.md` also document a few commands (`pnpm clean`, `pnpm vrf:watch`, and an older "start everything" meaning of `pnpm dev`) that don't match the current root scripts, so treat those docs as partially stale and trust `package.json` scripts blocks over prose.

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
| `protocol` (`@cryptopets/protocol`) | `pnpm --filter @cryptopets/protocol lint` | `pnpm --filter @cryptopets/protocol test` (vitest) | *(none, consumed as raw TS; `typecheck` runs `tsc --noEmit`)* | same vitest pattern |
| `verifier` (`@cryptopets/verifier`) | `pnpm --filter @cryptopets/verifier lint` | `pnpm --filter @cryptopets/verifier test` (vitest) | *(none, consumed as raw TS; `typecheck` runs `tsc --noEmit`)* | same vitest pattern |
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
| `protocol` (`@cryptopets/protocol`) | TypeScript | MIT, dependency-free battle protocol: the TS combat engine plus (in progress) canonical encodings, hashes, and drand seed derivation. Consumed as raw TS by `shared`/`backend` and by `verifier` |
| `verifier` (`@cryptopets/verifier`) | TypeScript | MIT, standalone public receipt verifier (§H). Depends only on `protocol`; no backend access, no database. Checks seed derivation, operator signature, drand BLS beacon, combat replay, progression, and hash-chain continuity, reporting each independently |
| `proto` | Protobuf/Buf | gRPC contract (`GameDataService`) between `indexer-go` and `backend` |

### Data flow
On-chain events (EVM via subgraph watermark polling, Solana via WebSocket push + backfill) are mirrored into Prisma-owned Postgres (`pet_roster`, `battle_history`) by **two parallel indexers**: the backend's built-in Node `RosterIndexer`, and the optional Go `indexer-go`. The Node indexer is the source of truth in local dev; `indexer-go` is promotable later and can additionally stream settled battles straight to the backend over gRPC (`StreamLiveBattles`, defined in `proto/cryptopets.proto`). If `indexer-go` is down, the backend circuit-breaks back to reading Postgres directly (`ROSTER_READ_SOURCE` env var controls `grpc` vs `postgres`). Frontend, mobile, and website all talk to the backend via REST + GraphQL; none of them read chain state directly. See `docs/architecture.md`, `backend/API.md`, `indexer-go/README.md`.

Note: `docs/README.md` and `docs/architecture.md` link to `indexer-go/ARCHITECTURE.md`, which doesn't exist. The real doc is `indexer-go/README.md`.

### Cross-chain interfaces: one thin adapter layer, plus logic that stays deliberately separate
`shared/src/hooks/adapters/` (`ChainAdapter` in `types.ts`) is a real, shared TypeScript interface. `useEvmAdapter` and `useSolanaAdapter` both implement it, `useChainAdapter` returns whichever is active, and every public pet-action hook (`useCreatePet`, `useLevelUpPet`, `useTrainPet`, `useRenamePet`, `useTransferPet`, `useBattlePets`, `useBreedPets`, the pet-list read) consumes it chain-blind. Check `adapters/types.ts` before assuming this doesn't exist.

What that adapter does NOT unify: `frontend/src/chains/ethereum/` (wagmi client, in-tree ABI JSONs: `combatSimAbi.json`, `gameConfigAbi.json`, `gameLogicAbi.json`, `petCoreAbi.json`) and `frontend/src/chains/solana/` (Anchor wallet/provider/signer) are still separate, low-level wiring with no shared interface between them, each adapter reaches into its own directly. The async battle/breed VRF flows (`useEvmBattleFlow.ts`, `battleWithSwitchboardVrf.ts`) and the combat simulator itself are also not unified; see the next section. Treat the adapter as a thin, uniform shape over pet-action mutations and reads, not a claim that the underlying chain logic is shared.

### Combat simulator: two frozen ports, two live ones, one set of golden vectors
The battle/combat logic exists in four independent implementations, and as of §L Phase 6 they are **no longer peers**:

- **Frozen** — `contracts/ethereum/src/CombatSim.sol` and Solana's `combat.rs`. These settled real battles whose results are permanent on-chain records, so they have to keep replaying those records forever. **Do not change them.** A bug found here is fixed forward in the live ports under a new `rulesetVersion`; patching a frozen port silently rewrites history instead of fixing anything.
- **Live** — `protocol/src/combat/` (the canonical engine, re-exported from `shared/src/utils/combat` for existing importers) and `indexer-go/internal/combat/` (the independent verifier). These two `MUST` change together. §F's circuit breaker only has value because they were written to disagree if either drifts, so updating one alone quietly disarms it.

All four are still validated against the same golden vectors at `contracts/test-vectors/{battle,xp}.json`, run by Hardhat, Anchor, `combat_golden_test.go`, and `@cryptopets/protocol`'s `tests/combat/goldenVectors.test.ts`. Keeping the frozen suites running is the point: they prove the vectors still describe what actually settled on chain, and the live suites prove the current engine has not drifted from it.

Hashing uses **legacy Keccak-256** (`keccak256(abi.encodePacked(...))` byte layout); a SHA3-vs-Keccak mismatch fails every vector. The TS port covers XP and level progression as well as fight math: `protocol/src/combat/xp.ts` mirrors `GameLogic._calcXp` / `PetCore.addXp` / `PetCore.recordBattleOpponent` and is validated against `contracts/test-vectors/xp.json`, with the snapshot-shaped wrapper in `protocol/src/progression/` (vectors: `protocol-progression.json`). This became portable once `lastOpponentId`/`streak` were frozen into the battle snapshot; before that the client had no way to know the streak state XP depends on. Note the decay shift **must be clamped to 31** in TS: JavaScript's `>>` masks the shift count to 5 bits, so an unclamped `200 >> 32` returns 200 where Solidity, Rust, and Go all return 0. `indexer-go/internal/combat/xp.go` still covers only the formula and decay, not level-up.

**If a golden vector test fails, a live port has drifted from the rules real battles were settled under. Fix the drifted port, never edit the vector.** A *frozen* port failing a vector means something worse — the vectors or the contract source no longer match what is deployed — and is an incident, not a test failure.

### Per-battle on-chain settlement is retired (§L Phase 6)
New battles run through the backend-authoritative path (`BATTLE_BACKEND_MODE_ENABLED`): signed intent, committed drand round, signed receipt, Merkle batch anchored by `BattleBatchRegistry`. `GameLogic`'s `requestBattle`/`settleBattle` flow and both settle keepers are **legacy**, kept for one reason — every battle they settled has to stay replayable, and the events and receipts they produced stay served indefinitely (§H). Retiring the path means new battles stop using it, never that old ones become uncheckable. The keepers remain deployable (`KEEPER_ENABLED`, `KEEPER_SOLANA_ENABLED`, both off by default) so an existing deployment can drain in-flight requests rather than stranding them.

### Settle keeper: the second EVM breed/mint transaction isn't the player's
Battles no longer take this path at all as of §L Phase 6 (above). Breed and mint still do — they have no backend-authoritative equivalent and continue to settle on chain.

`GameLogic`'s async flows (`requestBattle`/`requestCreateFromDNA`/`requestMintStarter` → Pyth Entropy reveals → `settleX`) used to have the frontend send the settle transaction itself, meaning two wallet prompts per action even though settle is permissionless. A backend service, `backend/src/features/settle-keeper/`, now watches Pyth Entropy's `Revealed` event and sends the settle transaction from its own wallet; the frontend only falls back to prompting the player if the keeper hasn't settled within ~45s (keeper outage or not configured). Gated by `KEEPER_ENABLED` (off by default); see `backend/env.example` for the full var list. This fixes only the double-signature UX; the related security fix — `requestBattle` snapshotting sim inputs so a level-up between request and settle can't reroll a committed battle — already lives in `GameLogic.sol` itself. See `docs/plan-realtime-battle-ux.md` / `docs/plan-realtime-battle-impl.md` for the full design and threat model.

### Battle fee funds the settle keeper's own gas (EVM) — retired
Retired with the on-chain battle path (§L Phase 6): `GameConfig.battleFee`, `setBattleFee`, and `useFees().battleFee` are all gone, and the keeper settles breed and mint only. Kept because the `GameConfig` migration it forced is still live and its env-staleness warning still applies. The original text follows.

The EVM settle keeper (above) sends `settleBattle` from its own wallet, but until this was added that transaction (~800k gas, `SETTLE_GAS_LIMIT` in `backend/src/features/settle-keeper/abi.ts`) was entirely unfunded — the player's `requestBattle` payment only ever covered the Pyth Entropy fee. `GameConfig.battleFee` (owner-tunable via `setBattleFee`) is now required on top of the entropy fee at `requestBattle` time, escrowed in the pending record, and refunded on `cancelBattle` (no settle tx is ever sent for a cancelled request); on a normal settle it just adds to the contract's withdrawable balance alongside the other protocol fees — there's no automatic reimbursement to the keeper wallet specifically, so it still needs manual top-ups from `withdraw()` proceeds. The frontend surfaces this via `useFees().battleFee` (chain-neutral — see the Solana section below) and shows it in the Start Battle button label. Because `GameConfig` isn't behind a proxy (see its own doc comment), adding this field required a fresh `GameConfig` deployment plus a new `setGameConfig(address)` setter on both `GameLogic` and `PetCore` (added together, deliberately — `PetCore` reads several other config values like `battleCooldown`/`poolSizes`, and pointing only one proxy at a new instance would let the two silently diverge). `scripts/upgrade-game-config.ts` handles the migration: it replays every existing tunable from the old `GameConfig` onto the new one before repointing anything, so live-tuned values (fees, skill balance, cooldowns) aren't reset to source defaults. This has been run against the live Base Sepolia deployment; any client env (`VITE_GAMECONFIG_ADDRESS`, `KEEPER_GAME_CONFIG_ADDRESS`) pointing at the old `GameConfig` address needs updating too, or fee reads fail outright (the old contract has no `battleFee()` at all) — check `frontend/.env`/`.env.local` and `backend/.env` aren't stale before assuming a deployment issue is something else.

### Solana battles are retired too (§L Phase 6)
`commit_battle`/`settle_battle`/`cancel_battle`, the `BattleRequest` account, the Solana settle keeper (`backend/src/features/settle-keeper-solana/`), and `GlobalState.battle_fee_lamports` are all gone. Solana battles now take the same backend-authoritative path as EVM ones, so `settle_breed`/`settle_mint` are the only remaining commit/settle flows, and both still require the player's own signature (their Metaplex Core mint CPI needs a real payer signature — see `docs/plan-realtime-battle-solana.md` Workstream S2 for why the keeper never generalized to them).

Two things deliberately stayed. `game/battle_sim.rs` and `game/xp.rs` have no caller left in the program but are **frozen, not deleted**: their golden-vector tests are what prove `contracts/test-vectors/{battle,xp}.json` still describe what actually settled on this chain. And `set_open_to_challenges` plus `PetAccount.open_to_challenges` remain as the owner's stated defender-consent preference — the program no longer reads the flag, so **nothing enforces it until the backend matchmaker does**.

Account layout: removing `battle_fee_lamports` grew `GlobalState._reserved` back from 16 to 24 bytes, so `GlobalState::SPACE` and every preceding field offset are unchanged and no `CURRENT_ACCOUNT_VERSION` bump is needed. A live account reads the old fee value back as padding. `ErrorCode` did renumber, though: `#[error_code]` assigns codes sequentially from 6000, so dropping the battle variants shifted every code after them.

**Rust/Anchor changes here were written without a local toolchain (no `cargo`/`anchor`/`rustc`/`solana` on PATH in this environment) — run `anchor build` / `anchor test` before trusting them.**

### Entropy / randomness
Both remaining async EVM flows — breed (`requestCreateFromDNA`) and starter mint
(`requestMintStarter`) — use Pyth Entropy v2 (`requestV2` → `entropyCallback`
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
Solana breeding and minting use Switchboard On-Demand (commit then settle), also async.
Battles use neither: they are seeded from a committed drand round by the backend (§E).

### Pet stats: chain state plus backend progression, merged at the read
On-chain `level`/`xp`/`winCount`/`lossCount` are **frozen** for battles — nothing has written them since §L Phase 6 — while the live record accumulates in `pet_battle_progress`. Neither table alone is right: the roster misses every backend battle, and progress rows only exist for pets that have fought.

The rule, applied in two places because there are two read paths:
- **Backend-served pets** (opponents, `pet`, `searchPets`, `allPets`): merged server-side in the GraphQL resolvers via `backend/src/repositories/battleProgress.overlay.ts`.
- **A player's own pets**: read straight off PetCore / the Solana program by the chain adapter, so the *client* merges, in `usePetList` via `shared/src/hooks/useBattleProgress.ts` (backed by the `battleProgress(chain, petIds)` GraphQL field).

Both apply the same rule: a pet with a progress row shows backend progression, one without shows chain truth, and `readyAt` takes the **later** of the two cooldowns (breeding still writes the on-chain one; battles write the backend one). Progress rows are seeded from on-chain level on a pet's first battle, so the two agree the moment a row appears.

The merge is deliberately **not** in `roster.repository.ts`. `snapshot.builder.ts` seeds a first progress row from the roster's on-chain level and `intent.service.ts` checks ownership there; merging in the repository would feed overlaid progression back into the thing that produces it.

Matchmaking is the exception to the two-site split above: `findReadyOpponents` filters, bands and orders on level and cooldown, so it merges in the query itself (a raw `LEFT JOIN` against `pet_battle_progress`) rather than being overlaid afterwards. A post-filter can only drop rows a page already holds, which fixes the cooldown and leaves the level band reading frozen values. The cost is that this one query has **no gRPC fast path**: indexer-go's cache holds chain state and has no view of `pet_battle_progress`, a backend-owned table, so it can no longer answer it correctly. `getPetById` keeps its cache path, because there the resolver does the merge.

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

This monorepo has split licensing; see the table in `README.md`. `contracts/ethereum`, `contracts/solana`, `indexer-go`, `proto`, `protocol`, and `verifier` are MIT; everything else (`frontend`, `backend`, `mobile`, `website`, `shared`) is PolyForm Noncommercial 1.0.0 (root `LICENSE`). Match the license of whichever package you're editing when adding new files.

`protocol` (`@cryptopets/protocol`) is MIT deliberately: the backend-authoritative battle design (`docs/plan-backend-battle-architecture.md` §H) only holds up if outsiders can run the receipt verifier, and the verifier depends on this package. So it must never import from a PolyForm package (`tests/package.test.ts` enforces it), and it must stay free of clock reads, ambient randomness, and I/O (eslint enforces the first two). The TS combat engine lives here now, re-exported from `shared/src/utils/combat` so existing importers are unchanged.
