# Indexer-go v2 Plan — Decode the new contract event surface

Goal: bring `indexer-go` up to the **CryptoPets v2** contract stack
(`contracts/plan-contract-upgrade.md`). The contracts now emit a richer,
differently-shaped event surface (XP/leveling, lineage, the OwO-style combat
sim, marriage, gacha mint) and the roster carries many new fields. This plan
covers decoding that surface into `pet_roster` / `battle_history`, porting the
combat sim to Go for pre-fight win estimates, and widening the gRPC contract —
the downstream "Phase 5 (core)" work in the contract plan's §9.1.

Scope: `indexer-go/internal/*`, `proto/cryptopets.proto`, and the matching
Prisma migration in `backend/prisma` (schema is **Prisma-owned** — indexer-go
does DML only, never DDL). It does **not** cover backend repositories or
frontend; those consume what this plan produces.

Branch: `feat/indexer-v2`. Base it on whichever of `main` /
`feat/contracts-v2` carries the merged v2 IDL + subgraph schema — this adapter
consumes both.

---

## 1. Where we are (honest assessment)

`indexer-go` today indexes the **v1** event surface. The shapes it reads no
longer match what v2 emits.

| Area | Indexer-go today | v2 contract reality | Gap |
| --- | --- | --- | --- |
| Roster fields | `level, rarity, dna, winCount, lossCount, readyAt` (`internal/indexer/types.go:12`) | adds `xp, generation, parent1/2Id, breedCount, speciesId, spouseId`, **split cooldowns** (`ready_time` → battle/`breed_ready_time`/`train_ready_time`), `asset` (Core) | roster struct + both decoders + schema |
| Solana pet decode | IDL-driven `PetAccount` decode (`internal/solana/decode.go:37`) | `PetAccount` grew ~15 fields (`state.rs:263`) | refresh embedded IDL + map new fields |
| Solana battle event | `BattleResult{attacker, defender, attackerWon}` 17-byte body (`decode.go:73`) | `BattleResolved{attacker, defender, winner, loser, seed[32], firstWins, rounds, winnerHpRemaining, xpWin, xpLoss}` (`settle_battle.rs:167`) | new discriminator, new Borsh body |
| EVM battle | subgraph `Battle{attacker, defender, winnerPetId, foughtAt}` (`internal/evm/indexer.go:154`) | `BattleResolved(requestId, winnerId, loserId, vrfSeed, …)` joined to `BattleRandomnessRequested` for attacker/defender | subgraph schema is the join layer; adapter reads widened entity |
| Battle pipeline | `BattleEvent{attacker, defender, winnerPetID, foughtAt}` (`types.go:28`) | needs `seed, rounds, winnerHpRemaining, xpWin, xpLoss` for replay/animation | widen `BattleEvent` + `battle_history` + proto |
| Combat sim | none | deterministic round-based sim, golden vectors in `contracts/test-vectors/battle.json`, `xp.json` | **new Go package** — biggest new piece |
| Breed / train / marriage | not indexed | `BredEvent`, `Trained`, `Marriage*` events | decide scope (see §6) |
| gRPC contract | `PetResponse` + `BattleEvent` v1 fields (`proto/cryptopets.proto`) | clients want xp/generation/species + battle seed/rounds | widen proto, regenerate Go + Node stubs |

The architecture (single version-guarded writer, two adapters behind
`ChainIndexer`, commit-then-cache) is sound and **unchanged** — this is a
field-and-decode expansion, not a redesign.

---

## 2. Prerequisite — Prisma migration (do first, in `backend/`)

The writer only does DML; every new column must exist before indexer-go can
write it. Coordinate one migration in `backend/prisma/schema.prisma`:

- `pet_roster`: add `xp INT`, `generation INT`, `parent1_id`, `parent2_id`
  (string, nullable), `breed_count INT`, `species_id INT`, `spouse_id` (string,
  nullable), `breed_ready_at BIGINT`, `train_ready_at BIGINT`,
  `asset` (string, nullable — Solana Core asset / null on EVM).
- `battle_history`: add `seed` (string/bytea hex), `rounds SMALLINT`,
  `winner_hp_remaining INT`, `xp_win INT`, `xp_loss INT`, `loser_pet_id`.
- New tables (only if §6 decides to index them): `marriage`
  (`chain, pet_a_id, pet_b_id, owner_a, owner_b, status, since`), optionally
  `breed_history`.

Run `npx prisma migrate dev` from `backend/` **before** pointing indexer-go at
the DB. Update `README.md`'s "Prereq migrations" line. All new columns
nullable / defaulted so the v1 Node indexer keeps writing during shadow mode.

---

## 3. Phases

Each phase is independently shippable and leaves `go test ./...` green. The
roster path and the battle path are separable — do roster first (simpler,
lower risk), then battle (introduces the sim).

> **Status:** Phases 0–5 implemented on `feat/indexer-v2` (roster v2, battle v2
> decode, the Go combat sim with golden-vector parity, the gRPC widening +
> `EstimateWin`, and the parity test + docs). Phase 6 (auxiliary breed/train/
> marriage streams) and the Metaplex Core ownership work remain decision-gated.

### Phase 0 — IDL refresh & fixtures (½–1 day)

- Regenerate `internal/solana/idl/cryptopets.json` from the v2 Anchor build
  (`anchor build` → copy `target/idl/cryptopets.json`). This is the source of
  truth for `decodePetAccount`'s layout resolver.
- Add v2 decode fixtures under `internal/solana/` (real account bytes +
  expected struct) so `decode_test.go` pins the new layout.
- Copy the golden vectors `contracts/test-vectors/battle.json` and `xp.json`
  into the Go test path (embed or read relative) — Phase 3 consumes them.
- No behavior change yet; this phase just lands the inputs.

### Phase 1 — Roster v2 (1–2 days)

Widen the roster record and both decoders. No sim, no new battle logic.

- `internal/indexer/types.go`: add the §2 fields to `RosterUpdate`
  (`XP, Generation, Parent1ID, Parent2ID, BreedCount, SpeciesID, SpouseID,
  BreedReadyAt, TrainReadyAt, Asset`). Keep `ReadyAt` = battle cooldown.
- `internal/solana/decode.go`: map the new `PetAccount` fields
  (`state.rs:263` — `xp, generation, parent1_id, parent2_id, breed_count,
  species_id, spouse_id, breed_ready_time, train_ready_time, asset`). The IDL
  resolver already walks fields by name, so most of this is reading new keys
  out of the decoded `fields` map + guarding types.
- `internal/evm/indexer.go`: add the new fields to `subgraphPet`, the
  GraphQL queries (`fullSyncQuery`/`incrementalQuery` in the client), and
  `toUpdate`. **Depends on the EVM subgraph exposing them** — coordinate the
  subgraph schema bump (the contract side owns `subgraph/`).
- `internal/store/pg.go`: extend the `FlushRoster` column list + `ON CONFLICT`
  SET clause, and `LoadRoster`'s SELECT/scan, for the new columns.
- `internal/cache/roster.go`: carry the new fields through the cached copy so
  `GetPetState` can serve them.
- Tests: extend `decode_test.go`, `indexer_test.go` (both chains),
  `pg_test.go`, `roster_test.go`.

### Phase 2 — Battle v2 decode (1–2 days)

Replace the v1 battle shape end to end.

- `internal/indexer/types.go`: widen `BattleEvent` with `LoserPetID, Seed,
  Rounds, WinnerHpRemaining, XPWin, XPLoss`.
- `internal/solana/decode.go`:
  - New discriminator `sha256("event:BattleResolved")[:8]`.
  - New Borsh body parse: `attacker u32, defender u32, winner u32, loser u32,
    seed [32]u8, first_wins bool, rounds u8, winner_hp_remaining u16,
    xp_win u32, xp_loss u32` — fixed length, little-endian (mirror the
    existing `parseBattleResults` style but for the new layout). Keep the old
    parser only if any unsettled v1 battles must still drain; otherwise delete.
- `internal/evm/indexer.go` + client: read the widened `Battle` subgraph
  entity (which joins `BattleRandomnessRequested` → `BattleResolved` for
  attacker/defender + the new fields). Map into the widened `BattleEvent`.
- `internal/store/pg.go`: extend `InsertBattles` columns + `BattlesSince`
  SELECT/scan.
- Tests: golden-path battle decode for both chains; idempotency on
  `(chain, battle_id)` unchanged.

### Phase 3 — Go combat sim + pre-fight win estimate (2–4 days, the new core)

This is the load-bearing new capability (contract plan §3.3, §7): a Go
reimplementation of the deterministic combat sim so the UI can show pWin
**without an RPC simulation**.

- New package `internal/combat/`:
  - `dna.go`: DNA(16 digits) → five attributes (HP/ATK/DEF/INT/MDEF) +
    element + rarity multiplier (contract plan §3.1). Integer math only —
    must be **bit-identical** to Solidity/Rust.
  - `sim.go`: round-based sim driven by `keccak256(seed ‖ roundIndex)`
    (`golang.org/x/crypto/sha3` Keccak — NOT SHA3-256; match the on-chain
    `keccak256`). Initiative, strike-type split, crit, element mult, round
    cap, tie → defender (§3.3).
  - `skills.go`: the 8 passive archetype hooks (`speciesId % 8`), gated so
    they no-op until v2.1 Phase B species land. (Stub now, wire when contracts
    ship species.)
  - `xp.go`: `xpMult = clamp(100 + 10·(oppLevel−myLevel), 0, 200)`, win/loss
    base, same-opponent decay (§3.4).
  - `pwin.go`: sample N random seeds, run the sim, return win probability.
- **Parity is the acceptance test**: a `combat_golden_test.go` that loads
  `contracts/test-vectors/battle.json` + `xp.json` and asserts every case's
  `{winner, rounds, hp1RemainingBps, hp2RemainingBps, critCount}` and XP
  exactly. If a vector fails, the Go port is wrong — fix Go, never the vector.
- Keep this package **pure** (no DB, no chain) so it's reusable by the backend
  via gRPC and trivially testable. Surfacing pWin is a Phase 4 RPC.

### Phase 4 — Proto / gRPC widening (1 day)

- `proto/cryptopets.proto`:
  - `PetResponse`: add `xp, generation, parent1_id, parent2_id, breed_count,
    species_id, spouse_id, breed_ready_at, train_ready_at`.
  - `BattleEvent`: add `loser_pet, seed, rounds, winner_hp_remaining,
    xp_win, xp_loss`.
  - Optional new RPC `EstimateWin(WinRequest) returns (WinResponse)` backed by
    `internal/combat` pWin — lets the backend show odds pre-battle.
- Regenerate: `buf generate ../proto` → Go stubs in `pb/`; the Node backend
  loads the `.proto` at runtime so its side is just field access.
- `internal/grpcsrv/server.go`: populate the new `PetResponse` /
  `BattleEvent` fields; implement `EstimateWin` if added.
- Use **new field numbers only** (append-only) so a backend on the old proto
  keeps working during rollout.
- Tests: `grpcsrv/reads_test.go`, `server_test.go`.

### Phase 5 — Tests, metrics, ops (½–1 day)

- Per-chain decode coverage for every new field; a cross-chain parity test
  asserting an EVM pet and a Solana pet with the same DNA/level/rarity derive
  identical attributes via `internal/combat`.
- Metrics: keep the existing `indexer_last_version` lag gauge meaningful with
  the new event volume; add a counter for sim-parity failures if `EstimateWin`
  ships.
- Update `README.md` (new env if any, the Prisma prereq, the combat package)
  and `ARCHITECTURE.md`.

---

## 4. Optional / decision-gated work (§6 must resolve first)

### Phase 6 — Auxiliary event streams (breed / train / marriage)

The roster table already reflects the *result* of these (a bred pet appears,
a trained pet's xp/level move, a married pet's `spouse_id` is set) via the
PetAccount/subgraph-pet sync. The question is whether the indexer also needs
the **events** as first-class history:

- `Trained` — roster sync already captures the new xp/level. Index the event
  only if the UI wants a training log.
- `BredEvent` / `BreedSettled` — lineage is on the pet (`parent1/2Id`,
  `generation`); index the event only for a breeding feed / studFee accounting.
- `Marriage*` — `spouse_id` on the pet covers "is married". A separate
  `marriage` table is only needed if the UI lists proposals / history or the
  matchmaker queries marriages directly.

Recommendation: **ship Phases 0–5 first** (roster + battle + sim + gRPC are
what the frontend fight UI and matchmaking actually need), and add Phase 6
streams only where a concrete frontend/backend consumer asks for them.

### Metaplex Core ownership (blocks on contracts v2.1 Phase A)

Once Solana pets become Core assets, **transfers stop touching the program** —
the indexer can no longer learn the owner from `PetAccount.owner` alone
(contract plan §2.3). When v2.1 Phase A lands, the Solana adapter must also
watch Core asset accounts (programSubscribe on `mpl-core` filtered by
collection, or DAS backfill) and treat the Core asset owner as source of
truth. **Out of scope for this branch** — note it and sequence after contracts
v2.1 ships. The `asset` field added in Phase 1 is the forward hook.

---

## 5. File-by-file change map

| File | Change |
| --- | --- |
| `backend/prisma/schema.prisma` | new `pet_roster` / `battle_history` columns; migration (prerequisite §2) |
| `internal/indexer/types.go` | widen `RosterUpdate` + `BattleEvent` |
| `internal/solana/idl/cryptopets.json` | refresh from v2 anchor build |
| `internal/solana/decode.go` | new `PetAccount` fields; `BattleResolved` discriminator + Borsh body |
| `internal/evm/indexer.go` + client | widened `subgraphPet`, GraphQL queries, `toUpdate`, battle mapping |
| `internal/store/pg.go` | `FlushRoster`/`InsertBattles`/`LoadRoster`/`BattlesSince` column lists |
| `internal/cache/roster.go` | carry new roster fields through cache |
| `internal/combat/` | **new**: dna, sim, skills, xp, pwin + golden-vector test |
| `proto/cryptopets.proto` → `pb/` | widen messages; optional `EstimateWin`; `buf generate` |
| `internal/grpcsrv/server.go` | populate new fields; optional pWin RPC |
| `internal/solana/`, `internal/evm/`, `internal/store/` tests | new-field + parity coverage |
| `README.md`, `ARCHITECTURE.md` | prereq migration, combat package, env |

---

## 6. Open decisions (resolve before / during)

1. **Subgraph schema ownership**: the EVM `Battle` entity must join
   `BattleRandomnessRequested` → `BattleResolved` and expose the new pet
   fields. Confirm the contract-side subgraph bump is landing on the same
   branch this adapter targets (Phase 1/2 block on it).
2. **Keccak vs SHA3**: confirm the contracts use `keccak256` (Ethereum) /
   `solana_program::keccak` — the Go port must use legacy Keccak
   (`sha3.NewLegacyKeccak256`), not FIPS SHA3-256. A one-line mistake here
   silently breaks parity. Pin it with the golden vectors in Phase 3.
3. **Auxiliary event indexing (§4 Phase 6)**: do breed/train/marriage need
   first-class history tables, or is roster-state-only sufficient for v1 of the
   frontend? Default: roster-only, add streams on demand.
4. **`EstimateWin` RPC**: add the pWin endpoint now, or keep `internal/combat`
   internal until the frontend asks? Cheap to add; recommend shipping it since
   the sim is already there.
5. **Shadow-mode duration**: how long both the Node indexer and indexer-go
   write the new columns in parallel before promotion. The read cache must stay
   off until indexer-go is the sole writer (`README.md` milestone-8 rule).

## 7. Out of scope (this branch)

- Backend repositories / frontend fight animation (they consume this output).
- Metaplex Core owner tracking (blocks on contracts v2.1 Phase A — §4).
- The zk / off-chain-compute paths (contract plan §8) — the Go sim is the
  on-chain-parity reference, not a prover yet.
- Any schema DDL outside the coordinated Prisma migration.
