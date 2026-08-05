# AGENTS.md

Root coordination contract for AI and human contributors in this repo. Detailed architecture and working guidelines live in [CLAUDE.md](./CLAUDE.md); this file states the non-negotiables and where to look.

## Scope

- Applies to the whole monorepo: `frontend/`, `services/backend/`, `mobile/`, `website/`, `shared/`, `contracts/ethereum/`, `contracts/solana/`, `services/indexer-go/`, `proto/`, `services/image-generator/`.
- No nested `AGENTS.md` files exist yet. If one is added under a package, it may tighten rules for that subtree but must not relax the rules here.

Normative language: `MUST`/`MUST NOT` are mandatory. `SHOULD`/`SHOULD NOT` are expected by default; deviations should be explained in the PR. `MAY` is optional.

## Non-Negotiables

- `MUST NOT` change Solana's frozen combat port (`game/battle_sim.rs`, `game/xp.rs`). It has no caller left in the program, but its golden-vector tests are what still prove `contracts/test-vectors/{battle,xp}.json` describe what actually settled on that chain. A bug found there is fixed forward in the live ports below, under a new `rulesetVersion`, never by patching the frozen one. **The Solidity port is gone**: `CombatSim.sol` was deleted once it had no on-chain caller, which also removed `battle.json`'s Solidity generator and validator. `battle.json` itself is unchanged and still gates the live ports.
- `MUST` keep the two **live** combat ports in step with each other and with the golden vectors: `protocol/src/combat/` (the canonical engine, re-exported from `shared/src/utils/combat` for existing importers) and `services/indexer-go/internal/combat/` (the independent verifier). Changing one without the other re-breaks the circuit breaker in §F, whose whole value is that the two were written to disagree if either drifts. This covers XP and level progression too (`protocol/src/combat/xp.ts`, validated against `contracts/test-vectors/xp.json`), so an XP or decay change is a both-ports change. `services/indexer-go/internal/combat/xp.go` still covers the formula and the decay but not level-up.
- `MUST NOT` edit `contracts/test-vectors/{battle,xp}.json` to make a failing test pass — this holds more strongly now, not less. The vectors are the only mechanical link left between the frozen ports and the live ones. A live port that fails them has drifted away from the rules real battles were settled under.
- `MUST NOT` assume the `ChainAdapter` interface (`shared/src/hooks/adapters/`) covers more than pet-action mutations and reads. It is a real, shared interface (`useEvmAdapter`/`useSolanaAdapter` both implement it) and every public pet-action hook consumes it chain-blind, but the low-level chain wiring in `frontend/src/chains/{ethereum,solana}/`, the async battle/breed VRF flows, and the combat simulator remain intentionally separate per chain. See CLAUDE.md's cross-chain interfaces section for the exact boundary.
- `MUST` match the license of the package being edited when adding new files: `contracts/ethereum`, `contracts/solana`, `services/indexer-go`, `proto`, `protocol`, and `verifier` are MIT; everything else, `services/image-generator` included, is PolyForm Noncommercial 1.0.0 (root `LICENSE`). See the table in `README.md`. `protocol` is MIT on purpose (third parties have to be able to replay signed battle receipts), so it `MUST NOT` import from a PolyForm package; a test in that package enforces it. `verifier` is MIT for the same reason and depends on nothing but `protocol`.
- `MUST NOT` assume the root `pnpm lint` / `pnpm test` cover `image-generator`, and `MUST NOT` verify it with `pnpm --filter image-generator <script>`. It is not a pnpm workspace member, so that command prints `No projects matched the filters` **and exits 0**: it reports success having run nothing. Run its scripts from `services/image-generator/` instead. It keeps its own lockfile, installs with `pnpm install --ignore-workspace`, and is checked by its own CI workflow.
- `MUST NOT` treat the v1 contract gaps documented in `contracts/plan-contract-upgrade.md` (no battle authorization, the `changeDna` cheat, client-supplied Solana starter-pet DNA) as bugs to silently patch. They are the known baseline the v2 rewrite is designed around.
- `MUST` run the smallest scoped lint/test/build command for the package you touched (see Command Baseline below), not a full monorepo run, unless the change is broad.
- `SHOULD NOT` trust `DEVELOPMENT.md`, `contracts/ethereum/README.md`, or the root `eth:deploy` / `eth:vrf:watch` scripts at face value. Several reference commands removed in a past refactor; see CLAUDE.md's Commands section for what is actually current.

## Command Baseline

- Install: `pnpm install` (root), or `pnpm install:all` (root + frontend + website + backend + mobile + contracts/ethereum)
- Dev: `pnpm dev` (backend + frontend), or `pnpm dev:fe` / `pnpm dev:be` / `pnpm dev:mobile` / `pnpm dev:web` individually, or `pnpm fe:eth:local` / `pnpm fe:sol:local` for a full local chain + backend + frontend stack
- Lint: `pnpm lint` (covers frontend, shared, website, mobile only, not backend or contracts/ethereum)
- Test: `pnpm test` (equals `contracts/ethereum` test only; per-package test commands are in CLAUDE.md)
- Build: `pnpm build`

Full per-package lint/test/build matrix and single-test syntax: see [CLAUDE.md](./CLAUDE.md#commands).

## Where To Look

- Behavioral guidelines and full architecture: [CLAUDE.md](./CLAUDE.md)
- Data flow and component map: [CLAUDE.md](./CLAUDE.md#architecture) (`docs/architecture.md` is referenced in places but does not exist)
- Test suite conventions: [docs/testing.md](./docs/testing.md)
- Backend API surface: [services/backend/API.md](./services/backend/API.md)
- Indexer internals: [services/indexer-go/README.md](./services/indexer-go/README.md)
- Contract v1-to-v2 migration plan: [contracts/plan-contract-upgrade.md](./contracts/plan-contract-upgrade.md)
- Contribution workflow: [CONTRIBUTING.md](./CONTRIBUTING.md)
- Reporting vulnerabilities: [SECURITY.md](./SECURITY.md)

## Enforcement

Mechanical checks over prose, where they exist:

- ESLint per package (`frontend`, `shared`, `website`, `mobile`), plus a custom CSS-naming check in `frontend` (`lint:css`).
- Golden test vectors (`contracts/test-vectors/{battle,xp}.json`), run by Anchor, `indexer-go`'s `combat_golden_test.go`, and `@cryptopets/protocol`'s `tests/combat/goldenVectors.test.ts` (Vitest), are the cross-language enforcement for combat-simulator parity. Anchor's frozen suite proves the vectors still describe what really settled on Solana; the two live ports prove they have not drifted from it. Hardhat no longer checks `battle.json` — that leg went with `CombatSim.sol`.
- CI coverage workflow (`.github/workflows/coverage.yml`) runs frontend/backend/shared vitest coverage on every PR and posts a combined comment. The verifier workflow (`.github/workflows/verifier.yml`) replays a committed receipt corpus through the standalone verifier, and asserts a tampered corpus is rejected.
- There is no repo-wide `agents:check` or module-boundary lint yet. Rely on the per-package commands above and the golden vectors until one exists.
