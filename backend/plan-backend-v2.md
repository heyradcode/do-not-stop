# Backend v2 Plan — Expose the new indexer surface to clients

Goal: update the Node backend to read and serve the **CryptoPets v2** data that
`indexer-go` now writes — the new roster fields (XP, lineage, cooldowns,
species, marriage, Core asset) and the round-based combat-sim battle outputs
(loser, seed, rounds, winner HP, XP) — plus wire the new `EstimateWin` gRPC for
pre-fight odds.

Scope: `backend/src/*` and `backend/prisma`. The backend is the **middle** of
the dependency chain (indexer → **backend** → frontend/mobile); this is the
work that lets the clients see v2 state.

Key fact that bounds the scope: **the backend no longer decodes contract
events** — `indexer-go` is the sole writer of `pet_roster` / `battle_history`.
So this is read-and-expose work, not re-indexing. The one write path that
remains is the dialogue feature's client-reported battle row (`recordBattle`),
which keeps working because the new columns are defaulted.

Branch: `feat/backend-v2` (off `main`, which now carries the indexer + subgraph
v2 work).

---

## 1. Where we are (honest assessment)

| Layer | Today | v2 gap |
| --- | --- | --- |
| Prisma schema | `pet_roster` / `battle_history` already carry the v2 columns (merged with the indexer PR) | **No migration generated for them yet** — the latest is `add_battle_history_version`. Until `migrate dev` runs, indexer-go can't write the new columns. |
| `RosterPet` (`roster.repository.ts`) | `chain, petId, owner, name, level, rarity, dna, winCount, lossCount, readyAt` | drops `xp, generation, parent1/2Id, breedCount, speciesId, spouseId, breedReadyAt, trainReadyAt, asset` |
| Prisma `findReadyOpponents` mapping | maps only the v1 fields | must carry the v2 fields through |
| gRPC `PetWire` + mapping (`rosterReads.ts`) | v1 fields only | proto already has the v2 fields (loaded at runtime); map them |
| GraphQL `OpponentPet` (`schema.ts`) | v1 fields only | add v2 fields the clients want |
| `BattleRecord` (`history.repository.ts`) | `chain, battleId, attacker, defender, winnerPetId, foughtAt` | no `loserPetId, seed, rounds, winnerHpRemaining, xpWin, xpLoss` |
| `SettledBattle` / `BattleEventWire` (`battleStream.ts`) | v1 fields only | proto carries the sim outputs; map them for live battle UI / replay |
| `EstimateWin` RPC | not consumed | new pre-fight-odds capability indexer-go now serves |
| `GetPetState` RPC | not consumed | available for a single-pet read if a pet-detail endpoint is wanted |

The architecture is sound and unchanged — fail-open gRPC with Prisma fallback,
the write-through cache, the dialogue rivalry context all stay. This is a
field-widening pass plus one new RPC wiring.

---

## 2. Prerequisite — Prisma migration (do first, in `backend/`)

`schema.prisma` already declares the v2 columns; generate the migration and
regenerate the client so the typed `prisma` client exposes the new fields:

```bash
cd backend
pnpm prisma:migrate     # prisma migrate dev — creates the v2 migration from the schema diff
pnpm prisma:generate    # regenerate src/generated/prisma with the new fields
```

All new columns are defaulted, so the dialogue client-report write path and any
in-flight v1 rows stay valid. Until this runs, **indexer-go writes fail on the
missing columns** — this unblocks the whole chain.

---

## 3. Phases

Each phase compiles (`pnpm build`) and is independently shippable. Roster and
battle read paths are separable; do roster first (it's the consumer-facing
matchmaking path).

### Phase 0 — Migration & client regen (½ day)

§2. No code beyond the regenerated client. Verify `prisma.petRoster` /
`prisma.battleHistory` types now include the v2 fields.

### Phase 1 — Roster read path v2 (1 day)

Carry the new pet fields from DB + cache out to the GraphQL API.

- `repositories/roster.repository.ts`: extend `RosterPet` with the v2 fields;
  map them in the Prisma `findReadyOpponents` row projection.
- `grpc/rosterReads.ts`: extend `PetWire` + the `res.pets.map` projection with
  the v2 fields (proto already returns them — `keepCase:false` camelCases, so
  e.g. `breedReadyAt`, `parent1Id`). **Keep the gRPC and Prisma shapes
  identical** — they must return the same `RosterPet` or the read source
  changes the payload.
- `graphql/schema.ts`: add the v2 fields to `OpponentPet`. ints for
  `xp/generation/breedCount/speciesId`; decimal strings for the big-int ids
  (`parent1Id, parent2Id, spouseId`); `Float` for the `breedReadyAt /
  trainReadyAt` unix-seconds (matching how `readyAt` already dodges 64-bit).
- `graphql/resolvers.ts`: pass the new fields through (mostly automatic via the
  `...rest` spread, but the bigint cooldowns need `Number(...)` like `readyAt`).
- Decide which fields the frontend actually needs on the opponents list vs a
  pet-detail view (see §5.1).

### Phase 2 — Battle read path v2 (1 day)

Carry the combat-sim outputs through the battle stream and history reads.

- `grpc/battleStream.ts`: extend `BattleEventWire` + `SettledBattle` with
  `loserPet, seed, rounds, winnerHpRemaining, xpWin, xpLoss`; surface them on
  the in-memory chain-truth map if the live battle UI wants replay data (the
  `seed` re-runs the sim client-side for blow-by-blow animation, plan §3.3).
- `repositories/history.repository.ts`: extend `BattleRecord` with the v2 battle
  fields; expose them on the head-to-head / recent-form reads if the dialogue
  or a battle-log endpoint wants them.
- Note: the dialogue `recordBattle` client-report path has no sim outputs to
  write (it predates settlement) — leave those columns at their defaults there;
  the authoritative values come from indexer-go.

### Phase 3 — EstimateWin (pre-fight odds) (½–1 day)

Wire the new RPC indexer-go built for exactly this.

- `grpc/`: add an `estimateWin` client call (new file or extend `rosterReads`),
  fail-open like the matchmaking read (deadline + breaker + null on error).
- Expose it: a GraphQL field (e.g. `winProbability(chain, petId1, petId2)`) or a
  REST endpoint, so the client can show odds before committing a battle.
- Gracefully degrade when the cache is cold (`UNAVAILABLE`) — return null / omit
  the estimate rather than erroring the page.

### Phase 4 — Dialogue enrichment (optional, ½ day)

The AI banter can use the richer battle data for better narration:
`rounds` + `winnerHpRemaining` distinguish a 2-round blowout from a 30-round
nail-biter; `xpWin/xpLoss` and the level-diff flavor the stakes. Feed these into
the LLM context (`features/dialogue/context.ts`) where head-to-head / recent
form already go. Purely additive; skip if not prioritized.

### Phase 5 — Tests & docs (½ day)

- Repository + resolver tests for the new fields (roster projection parity
  between the Prisma and gRPC paths is the key one — they must agree).
- Update any backend README / DEVELOPMENT notes on the v2 fields and the
  migration prereq.

---

## 4. File-by-file change map

| File | Change |
| --- | --- |
| `prisma/schema.prisma` → migration | generate the v2 migration (prereq §2) |
| `src/generated/prisma/*` | regenerated by `prisma generate` |
| `repositories/roster.repository.ts` | `RosterPet` + Prisma projection gain v2 pet fields |
| `grpc/rosterReads.ts` | `PetWire` + projection gain v2 pet fields (parity with Prisma) |
| `graphql/schema.ts` | `OpponentPet` (and/or a pet-detail type) gains v2 fields |
| `graphql/resolvers.ts` | pass new fields through; `Number()` the bigint cooldowns |
| `grpc/battleStream.ts` | `BattleEventWire` / `SettledBattle` gain combat-sim outputs |
| `repositories/history.repository.ts` | `BattleRecord` gains v2 battle fields |
| `grpc/estimateWin.ts` (new) | EstimateWin client + fail-open wrapper |
| `features/dialogue/context.ts` | (optional) richer battle context for the LLM |

---

## 5. Open decisions

1. **Which v2 fields the clients actually need, and where.** The opponents list
   probably wants `xp / generation / speciesId` for display; lineage and
   marriage may belong on a pet-detail view instead. Confirm with the frontend
   before widening `OpponentPet` vs adding a `pet(id)` query backed by the
   unused `GetPetState` RPC.
2. **EstimateWin surface** — GraphQL field vs REST, and whether it runs on the
   opponents list (N estimates) or only on a confirmed matchup (1 estimate).
   Per-row estimates multiply gRPC calls; prefer on-demand for a single matchup.
3. ~~**`upsertPet` / `upsertManyPets`** in `roster.repository.ts` look vestigial
   now that indexer-go is the sole writer — confirm no live caller and remove,
   or leave for the `-scan-once`/dialogue path. (Verify before deleting.)~~
   **Resolved:** verified no caller anywhere in the repo (no `-scan-once` path
   exists) and removed `upsertPet`, `upsertManyPets`, and the also-unused
   `countByChain`. `roster.repository.ts` is now read-only.
4. **Seed wire type** — indexer-go sends the battle `seed` as a `0x`-hex string;
   confirm the client wants hex (it does, for keccak replay) and pass it through
   unchanged.

## 6. Out of scope (this branch)

- Frontend/mobile consumption (the next layer; this PR just exposes the data).
- Any contract-event decoding (indexer-go owns it; the backend only reads).
- Metaplex Core ownership / the auxiliary breed-train-marriage history streams
  (blocked on indexer-go Phase 6 / contracts v2.1).
