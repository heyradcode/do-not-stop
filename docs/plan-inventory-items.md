# Plan: inventory and item NFTs (roadmap §4)

Working plan for the feature described in
[`plan-future-features-roadmap.md`](./plan-future-features-roadmap.md) §4. That section is
the design rationale; this file is the execution order. Steps are small on purpose: each one
ends at a command that passes, so the branch is revertible at any point.

Branch: `feat/inventory-item-nfts`. **All four phases are complete**; see the note at the
end for what remains before this is live.

## Scope

| Decision | Choice |
|---|---|
| Chains | EVM only. Solana deferred, per §4's EVM-first recommendation. |
| Categories | Consumable, collectible/material, equipment with combat stats. No cosmetics. |
| Acquisition | Battle-reward drops plus an owner-gated admin grant. |
| Clients | Web only. Hooks live in `@shared/core` so mobile can adopt them later. |

Phases 1 to 3 ship a working inventory on their own. Phase 4 is the one that touches signed
protocol objects, and it is sequenced last for that reason.

## Design decisions this plan assumes

1. **Equipping escrows the ERC-1155 token into `ItemCore`.** §4 requires equip state to be
   verifiable from chain state at a recorded `sourceVersion`. Escrow makes the equip mapping
   itself the ownership proof, and structurally prevents one sword buffing five pets.
2. **The battle snapshot carries resolved modifiers and the item type id.** Resolved
   modifiers are what §4 mandates, so unequipping cannot change a committed fight. The type
   id rides along so a third party can cross-check the numbers against the published catalog
   rather than taking them on faith.
3. ~~**`Ruleset` gains `itemCatalogHash`**~~ — **revised during 4.3.** The combat-affecting
   catalog is encoded *into* the ruleset instead, so `rulesetHash` covers it natively. A
   separate digest would have been a second thing to keep in step for no gain, since the
   published bundle already carries the rows. The property that mattered is unchanged: a
   rebalance moves `rulesetHash`, which invalidates outstanding defence authorizations by
   design.
4. **Modifiers are non-negative flat bonuses in v1**, applied after `extract` and before the
   skill modifiers, with the sum clamped to 65535 rather than wrapped. Excluding negative
   modifiers removes any underflow question against `toUint16`'s wrap semantics.
5. **Drops derive from the battle's existing drand seed** (`keccak(seed, battleId, "DROP")`),
   so no second randomness system and no drop the operator can grind. Note the second half
   of this as written was wrong: a drop does **not** replay from the receipt like other
   outcomes, because the rates and the drop pool are unpublished backend constants. See
   D2 in [`plan-battle-inventory-hardening.md`](./plan-battle-inventory-hardening.md).

## Environment notes

- `contracts/ethereum` pins `@openzeppelin/contracts-upgradeable` at **4.7.3** while
  `@openzeppelin/contracts` is ^5.4.0. `ItemCore` therefore uses the 4.x initializer style
  (`__ERC1155_init`), not v5's `_update` hook.
- Migrations run with `prisma migrate deploy`, never `dev`. Every `CREATE TABLE` ends with
  `ENABLE ROW LEVEL SECURITY` and no `FORCE`.
- New files under `contracts/ethereum`, `services/indexer-go`, `protocol` and `verifier` are
  MIT. Everything else is PolyForm Noncommercial 1.0.0.

---

## Phase 1: chain layer

- [x] **1.1 `ItemCore.sol` core.** ERC-1155 behind UUPS with `OwnableUpgradeable`, matching
      `PetCore.sol`'s header, `VERSION` constant, event set and `authorizeCaller` pattern.
      Item type ids are the ERC-1155 token ids; balances are quantities. Surface for this
      step: `initialize`, `mintTo`, `burnFrom`, caller authorization.
      Verify: `pnpm --prefix contracts/ethereum compile`.
- [x] **1.2 Equip and unequip.** `equip(petId, slot, itemType)` transfers one unit into the
      contract and records it; `unequip(petId, slot)` returns it. `equipmentOf(petId)` view
      for the indexer. Ownership of the pet is checked against `PetCore`.
      Verify: `pnpm --prefix contracts/ethereum compile`.
- [x] **1.3 `test/ItemCore.test.ts`.** Mint, burn, equip escrow, unequip return, double-equip
      rejection, unauthorized caller rejection, equip by a non-owner of the pet.
      Verify: `pnpm --prefix contracts/ethereum hh test test/ItemCore.test.ts`.
- [x] **1.4 Deployment wiring.** Add `ItemCore` impl plus `ERC1967Proxy` to
      `ignition/modules/CryptoPetsV2Live.ts`, authorize the backend minter, and return it so
      `scripts/deploy.ts` writes the address out.
      Verify: `pnpm --prefix contracts/ethereum deploy:visualize`.
- [x] **1.5 Subgraph.** `ItemBalance` and `PetEquipment` entities in `subgraph/schema.graphql`,
      an `ItemCore` ABI under `subgraph/abis/`, a data source in `subgraph.template.yaml`, and
      handlers in a new `subgraph/src/item.ts` next to `pet.ts`.
      Verify: subgraph codegen and build from `contracts/ethereum/subgraph`.
- [x] **1.6 `indexer-go` ingest.** `ItemUpdate` and `EquipmentUpdate` in `internal/indexer`,
      paged queries in `internal/evm/client.go` and `indexer.go` behind their own watermarks,
      row conversion in `mapping.go`.
      Verify: `go vet ./... && go test ./internal/evm`.
- [x] **1.7 `indexer-go` writes.** Version-guarded batch upserts in `internal/store/writer.go`
      and `pg.go`, same `(chain, id)` plus monotonic `lastVersion` shape `pet_roster` uses, so
      a lower-versioned write is discarded rather than applied.
      Verify: `go test ./internal/store`.

## Phase 2: backend inventory domain

- [x] **2.1 Prisma models and migration.** `ItemDefinition` (backend-managed catalog),
      `ItemRoster` and `PetEquipment` (indexer-owned, `lastVersion`-guarded), `ItemEntitlement`
      (backend-owned drops awaiting claim). One migration, RLS on every new table, copying the
      comment block from `20260806100000_add_chat_threads/migration.sql`.
      Verify: `pnpm --filter backend build`.
- [x] **2.2 Catalog seed.** A checked-in JSON catalog plus a loader, so item content is data
      rather than code. Covers all three shipping categories.
      Verify: seed script runs against a local database.
- [x] **2.3 Read surface.** `backend/src/features/inventory/` laid out like `features/chat`
      (`*.controller.ts`, `*.service.ts`, `*.schema.ts`, `index.ts`), routes in
      `backend/src/routes/inventory.ts` behind `verifyToken` with the read/write rate-limit
      split `routes/chat.ts` uses.
      Verify: `pnpm --filter backend test`.
- [x] **2.4 GraphQL reads.** `inventory(chain, owner)` and `itemCatalog` in
      `backend/src/graphql/{schema,resolvers}.ts`. The caller's own inventory takes its owner
      from the session, never from an argument.
      Verify: `pnpm --filter backend test`.
- [x] **2.5 Write surface.** `useItem` (apply the consumable effect to `pet_battle_progress`,
      then `ItemCore.burnFrom`), `equipItem` and `unequipItem` (send the chain tx and return
      pending; the indexed row is the truth), `claimEntitlement`, and an owner-gated
      `grantItem` admin route.
      Verify: `pnpm --filter backend test`.
- [x] **2.6 Battle drops.** The battle worker writes `ItemEntitlement` rows in the same
      transaction as the receipt, the way `battle_history` is written today, so a drop cannot
      exist without its receipt or the reverse.
      Verify: `pnpm --filter backend test`.

## Phase 3: web UI

- [x] **3.1 Shared hooks.** `shared/src/hooks/inventory/` (`useInventory`, `useItemCatalog`,
      `useUseItem`, `useEquipItem`), following the GraphQL-string plus `useApiClient` plus
      TanStack Query shape in `shared/src/hooks/leaderboard/useLeaderboard.ts`.
      Verify: `pnpm --filter @shared/core test`.
- [x] **3.2 `InventoryAdapter`.** A new chain-blind interface and `useInventoryAdapter` in
      `shared/src/hooks/adapters/`. `ChainAdapter` is not extended: `AGENTS.md` forbids it and
      §4 names this case. Reuse the pattern, not the interface.
      Verify: `pnpm --filter @shared/core lint`.
- [x] **3.3 Inventory page.** `frontend/src/pages/inventory/index.tsx` plus router and sidebar
      entries. Rarity styling reuses `shared/src/utils/pets/cosmetics.ts` verbatim, so pets and
      items share one rarity vocabulary.
      Verify: `pnpm --filter frontend lint:check && pnpm --filter frontend test`.
- [x] **3.4 Equip panel.** A panel under
      `frontend/src/components/pet/interactions/panels/`. One action over one pet with no
      intermediate states, so it composes shared hooks directly and keeps form state local
      (the `rename`/`train` shape), not a controller hook.
      Verify: `pnpm --filter frontend test`.

## Phase 4: equipment affects combat

The phase §4 gates behind a design review. It changes signed protocol objects.

- [x] **4.1 Snapshot schema v2.** `PetSnapshot.equipment: EquipEntry[]`
      (`{slot, itemType, hp, atk, def, int, mdef}`). `SCHEMA_VERSIONS.snapshot` 1 to 2, with 1
      kept in `SUPPORTED_VERSIONS` so historical receipts keep verifying. The domain tag is
      unchanged; the version inside the header is the mechanism for a layout change.
- [x] **4.2 Version-aware snapshot encoder.** `encodeBattleSnapshot` currently always writes
      the current version, so re-encoding a stored v1 snapshot at v2 would break its hash. The
      snapshot carries its own `schemaVersion` and the encoder emits the v1 layout for v1.
      This is the most breakage-prone edit in the plan.
      Verify: `pnpm --filter @cryptopets/protocol test`.
- [x] **4.3 Ruleset v2.** `Ruleset.itemCatalog` (encoded into the ruleset, not a separate
      digest — see the revised decision 3), `SCHEMA_VERSIONS.ruleset` 1 to 2, `RULESET_KEYS` /
      `serializeRuleset` / `parseRulesetBundle`'s unknown-key rejection all updated, and the
      catalog published in the bundle so replay works offline.
      Verify: `pnpm --filter @cryptopets/protocol test`.
- [x] **4.4 Engine modifiers.** `simulate()` takes per-pet modifiers, applied after `extract`
      and before skills, clamped at 65535. `ENGINE_VERSION` 1 to 2.
      Verify: `pnpm --filter @cryptopets/protocol test`, with
      `contracts/test-vectors/battle.json` passing **unchanged**: with no equipment the deltas
      are zero and the engine stays bit-identical, which is the compatibility test.
- [x] **4.5 New golden vectors.** Equipment cases in a new
      `contracts/test-vectors/equipment.json`. `battle.json` and `xp.json` are not edited.
      Verify: `pnpm --filter @cryptopets/protocol test`.
- [x] **4.6 Go port, same commit.** `combat.PetInputs` gains the modifier, `Simulate`,
      `SimulateWithLog` and `Verify` thread it through, applied at the identical point, plus
      `internal/combat/equipment_golden_test.go`. `AGENTS.md` makes this a MUST: §F's circuit
      breaker only has value because the two ports were written to disagree if either drifts.
      Verify: `go test ./internal/combat`.
- [x] **4.7 Backend wiring.** `snapshot.builder.ts` resolves equipment from the indexed
      `pet_equipment` rows and the catalog. `SOURCE_DEFAULT_RULESET` stops being a pure
      constant, so `accept.service.ts` (`ensureRulesetPublished`) and `reads.service.ts` build
      the ruleset from the live catalog.
      Verify: `pnpm --filter backend test`.
- [x] **4.8 Verifier.** `checks/combatReplay.ts` and `ruleset.ts` handle both snapshot
      versions. `verifier/fixtures/corpus.json` keeps its v1 receipts (they must still pass)
      and gains a v2 geared receipt, regenerated via `verifier/scripts/gen-corpus.ts`.
      Verify: `pnpm --filter @cryptopets/verifier test`.

### Consequence to accept before starting Phase 4

Bumping `ENGINE_VERSION` and adding the item catalog changes `rulesetHash` for every battle,
not only geared ones. Every outstanding `DefenseAuthorization` is invalidated and every
defender has to re-consent. `protocol/src/consent/types.ts` documents that as the intended
cost of a rules change, but it is user-visible and should ship deliberately.

Solana's frozen ports (`game/battle_sim.rs`, `game/xp.rs`) are not touched in any step above.

## Deployed (Base Sepolia, 2026-08-08)

`ItemCore` was reconciled into the existing `base-sepolia-v2` Ignition deployment, so only
its own futures broadcast; every other contract in the stack was left untouched.

| | |
|---|---|
| ItemCore proxy | `0xA6F2f05C2721937D0379482CFC39b7aBd641cD30` |
| ItemCore implementation | `0x1A4B5c4EC5C7Da973F6F0432c84B16fe9131477D` |
| owner | `0x86f88bd62a77ab39A50e1855D35B437B1eE3cEF5` (the deployer) |
| `petCore` | `0x1CEfc6C0DeCF7F7e299FB385012f1eAD8892FFe8`, the PetCore **proxy** |
| item wallet | `0xd23d56f66aB960220687078AcFEb7051AbAfaE05`, authorized and funded 0.003 ETH |

All eight equipment types are registered to their catalog slots (1/2/3 weapon, 10/11/12
armor, 20/21 trinket) and type 100 is confirmed still unregistered, which is what stops the
UI offering to equip a potion. A mint-and-burn round trip through the item wallet confirmed
the `authorizeCaller` grant took and left no residual balance.

The item wallet holds its own key rather than the anchor or signer key, because an
authorized caller can burn any wallet's items. Rotating it is `authorizeCaller(new)` then
`revokeCaller(old)`; the owner key stays out of `backend/.env` entirely, since only
`seed-item-catalog.ts --with-chain` needs it.

Addresses are written into `frontend/.env.local` (`VITE_ITEMCORE_ADDRESS`, injected by
`scripts/deploy.ts`) and `backend/.env` (`ITEM_CORE_*`). The backend block points at
`https://sepolia.base.org` rather than the drpc endpoint the contracts package uses: drpc
returned intermittent 500s on `eth_getTransactionCount` throughout this deployment.

## What is still outstanding

Two things, both needing a human decision rather than more code:

1. **The migration is unapplied.** No inventory read has run against a real table. Per
   CLAUDE.md there is one database and it is production, so `pnpm --filter backend
   prisma:migrate` is an operator call.
2. **Phase 4 ships a re-consent event.** `ENGINE_VERSION` 1 to 2 plus the ruleset's new
   catalog field changes `rulesetHash` for *every* battle, not only geared ones, so every
   outstanding `DefenseAuthorization` is invalidated and every defender must re-consent.
   That is the designed behaviour (`protocol/src/consent/types.ts` documents it as the
   intended cost of a rules change), but it is user-visible and should ship deliberately.

Also unverified by construction: the `ItemCore` write client's transactions are stubbed in
every test, and the two web screens have not been opened in a browser, since both need the
migration first. The contract, its Ignition deployment, the seeder's chain half, and the
runtime mint/burn/over-burn paths *were* exercised against a local Hardhat node, and the
deployed contract has since been exercised on Base Sepolia (see above).

The seeder's database half has not run, for the same reason as (1): `item_definition` does
not exist yet. The slots were therefore registered on chain directly rather than through
`seed-item-catalog.ts --with-chain`, which writes the table first and would have failed
before reaching the chain. Once the migration is applied, run the seeder normally — it is
idempotent, so it will write the definitions and find every slot already correct — then
`scripts/verify-inventory-setup.ts` to confirm the two halves agree.

## End-to-end check

Run `pnpm eth:node`, `pnpm --prefix contracts/ethereum deploy`, `pnpm dev:idx` against a
seeded catalog, then `pnpm dev:be` and `pnpm dev:fe`. Grant an item through the admin route,
confirm it appears in `/inventory` once the indexer sees it, equip it, run a battle, and check
the receipt's snapshot carries the resolved modifiers and replays clean through the verifier
against the local corpus.
