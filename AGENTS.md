# AGENTS.md

Root coordination contract for AI and human contributors in this repo. Detailed architecture and working guidelines live in [CLAUDE.md](./CLAUDE.md); this file states the non-negotiables and where to look.

## Scope

- Applies to the whole monorepo: `frontend/`, `backend/`, `mobile/`, `website/`, `shared/`, `contracts/ethereum/`, `contracts/solana/`, `indexer-go/`, `proto/`.
- No nested `AGENTS.md` files exist yet. If one is added under a package, it may tighten rules for that subtree but must not relax the rules here.

Normative language: `MUST`/`MUST NOT` are mandatory. `SHOULD`/`SHOULD NOT` are expected by default; deviations should be explained in the PR. `MAY` is optional.

## Non-Negotiables

- `MUST NOT` edit the golden test vectors in `contracts/test-vectors/{battle,xp}.json` to make a failing test pass. If a vector fails, the Go or Rust port has drifted from the Solidity contract; fix the drifted port, never the vector.
- `MUST` update all four combat-simulator ports together (`contracts/ethereum/src/CombatSim.sol`, Solana's `combat.rs`, `indexer-go/internal/combat/`, `protocol/src/combat/`) when changing combat logic. Never patch one leg alone. The TS port (`protocol/src/combat/`, re-exported from `shared/src/utils/combat` for existing importers) now covers XP and level progression too (`protocol/src/combat/xp.ts`, validated against `contracts/test-vectors/xp.json`), so an XP or decay change is also a four-port change. `indexer-go/internal/combat/xp.go` covers the formula and the decay but not level-up; that gap closes when the Go verifier lands.
- `MUST NOT` assume the `ChainAdapter` interface (`shared/src/hooks/adapters/`) covers more than pet-action mutations and reads. It is a real, shared interface (`useEvmAdapter`/`useSolanaAdapter` both implement it) and every public pet-action hook consumes it chain-blind, but the low-level chain wiring in `frontend/src/chains/{ethereum,solana}/`, the async battle/breed VRF flows, and the combat simulator remain intentionally separate per chain. See CLAUDE.md's cross-chain interfaces section for the exact boundary.
- `MUST` match the license of the package being edited when adding new files: `contracts/ethereum`, `contracts/solana`, `indexer-go`, `proto`, `protocol`, and `verifier` are MIT; everything else is PolyForm Noncommercial 1.0.0 (root `LICENSE`). See the table in `README.md`. `protocol` is MIT on purpose (third parties have to be able to replay signed battle receipts), so it `MUST NOT` import from a PolyForm package; a test in that package enforces it. `verifier` is MIT for the same reason and depends on nothing but `protocol`.
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
- Data flow and component map: [docs/architecture.md](./docs/architecture.md)
- Test suite conventions: [docs/testing.md](./docs/testing.md)
- Backend API surface: [backend/API.md](./backend/API.md)
- Indexer internals: [indexer-go/README.md](./indexer-go/README.md)
- Contract v1-to-v2 migration plan: [contracts/plan-contract-upgrade.md](./contracts/plan-contract-upgrade.md)
- Contribution workflow: [CONTRIBUTING.md](./CONTRIBUTING.md)
- Reporting vulnerabilities: [SECURITY.md](./SECURITY.md)

## Enforcement

Mechanical checks over prose, where they exist:

- ESLint per package (`frontend`, `shared`, `website`, `mobile`), plus a custom CSS-naming check in `frontend` (`lint:css`).
- Golden test vectors (`contracts/test-vectors/{battle,xp}.json`), run by Hardhat, Anchor, `indexer-go`'s `combat_golden_test.go`, and `@cryptopets/protocol`'s `tests/combat/goldenVectors.test.ts` (Vitest), are the cross-language enforcement for combat-simulator parity.
- CI coverage workflow (`.github/workflows/coverage.yml`) runs frontend/backend/shared vitest coverage on every PR and posts a combined comment.
- There is no repo-wide `agents:check` or module-boundary lint yet. Rely on the per-package commands above and the golden vectors until one exists.
