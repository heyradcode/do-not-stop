# Plan: harden the battle + inventory seam before it goes live

Review of the shipped roadmap §4 work (`docs/plan-inventory-items.md`, all four phases marked
complete) against the backend-authoritative battle path (`docs/battle-protocol.md`). This file
is the execution order for what that review found. Each step ends at a command that passes.

Branch: `fix/battle-inventory-seam`.

## Verdict

The feature is well built. Ownership boundaries are stated and held (indexer writes the
projections, the seeder writes the catalog, the player signs the equip), the two live combat
ports move together, the golden vectors cover the modifier ordering at a one-point margin, and
the doc comments record reasoning rather than restating code. Every suite is green:

| Suite | Result |
|---|---|
| `pnpm --filter backend test` | 914 passed / 89 files |
| `pnpm --filter @cryptopets/protocol test` | 595 passed / 34 files |
| `pnpm --filter @cryptopets/verifier test` | 86 passed / 13 files |
| `pnpm --filter frontend test` | 370 passed / 48 files |
| `pnpm --filter @shared/core test` | 567 passed / 80 files |
| `go test ./internal/{combat,evm,store}` | ok |

The defects are concentrated at one seam: the point where a stored snapshot is read back out
of the ledger. Phase 4 gave the snapshot a schema version and an equipment list, and one of the
three readers was never updated. That reader is the signing worker, so nothing settles.

Severity ordering below is by consequence, not by size of fix.

---

## B1 (blocker): the sign worker rebuilds every snapshot at schema version 1

**No battle can produce a receipt on any deployment where this code runs.** Not only geared
battles. Every battle.

`accept.service.ts:167-174` writes the snapshot with `schemaVersion: SNAPSHOT_SCHEMA_VERSION`
(currently 2) and stores `snapshotHash` computed at that version. `beacon.worker.ts:65` derives
the battle seed from that stored hash.

`sign.worker.ts:63-74` reads the row back through a `storedSnapshot` type that declares only
`domain`, `attacker`, `defender`, `takenAt`, and a `deserializePet` (line 376) whose `StoredPet`
interface stops at `sourceVersion`. Both `schemaVersion` and `equipment` are dropped. The
reconstructed object therefore encodes at version 1, because `assertBattleSnapshot` reads an
absent version as 1 by design.

`writeHeader` writes the version as a `u16` inside the hashed bytes, so a v1 encoding and a v2
encoding of the same ungeared pet differ. Confirmed by running the two hashes side by side on
an identical ungeared pair:

```
accept (schemaVersion 2): 0xf7ccca0ba2c0971b7f3b3a18b9bc200aa5616c84751efa3256ab93524ed7a054
sign   (version dropped): 0xac2c61bb061506d0a88b00b3c31203daba05e0a82d48239c8fd99cc54b60a159
```

`hashBattleReceipt` calls `assertBattleReceipt`, which re-derives the seed from
`hashBattleSnapshot(receipt.snapshot)` (`protocol/src/receipt/types.ts:152-161`) and throws when
it disagrees with `receipt.seed`. That throw is not a `SignerRefusedError`, so it escapes
`processSignMessage` into the dispatcher's backoff. Battles pile up in `verified` and
dead-letter.

For a geared battle the same bug has a second effect: had it not thrown first, the receipt
would publish a snapshot with the gear removed, and `checks/combatReplay.ts` would replay an
ungeared fight against a geared result.

Why the suite is green: `backend/tests/features/battle/worker/sign.worker.test.ts:95` defines
`SNAPSHOT` with no `schemaVersion` and computes its fixture `snapshotHash` from the same
version-less object (line 101). The fixture is a v1 snapshot on both sides, so it agrees with
itself. Production writes v2 on one side only.

### Fix

- [x] **B1.1 One deserializer, not three.** Extract the stored-snapshot reader into
      `backend/src/features/battle/ledger/snapshot.codec.ts` next to `snapshot.builder.ts`,
      round-tripping `schemaVersion` and `equipment` alongside the bigint fields. Delete
      `compute.worker.ts:113-145`'s copy and `sign.worker.ts:361-390`'s copy, and have
      `verify.worker.ts:60-62` use it instead of casting to `Record<string, unknown>`. Three
      readers of one stored shape is what let one of them fall behind, and a fix that patches
      only the third leaves the same trap set.
      Verify: `pnpm --filter backend test`.
- [x] **B1.2 Make the fixture representative.** Set `schemaVersion: SNAPSHOT_SCHEMA_VERSION` on
      the sign-worker test's stored snapshot and derive its `snapshotHash` from the same object,
      so the test fails without B1.1. Add a second case with a geared attacker asserting the
      persisted `payload.snapshot.attacker.equipment` survives into the receipt.
      Verify: `pnpm --filter backend exec vitest run tests/features/battle/worker/sign.worker.test.ts`.
- [x] **B1.3 Close the class of bug, not the instance.** Add a ledger-level test that runs
      accept, then re-reads the stored row and asserts `hashBattleSnapshot(decoded) ===
      row.snapshotHash`. That assertion holds for any future field added to the snapshot,
      which the two tests above do not.
      Verify: `pnpm --filter backend test`.

Nothing outside `backend/src/features/battle` changes. The protocol encoder, both combat ports
and the vectors are correct as they stand.

---

## C1: an unreadable catalog effect silently re-prices the ruleset

`catalog.ts:158-162` states the rule: "once an effect feeds combat, an unreadable one has to be
a hard error, because silently dropping it would change a fight rather than a label." Phase 4
made effects feed combat and the code did not follow.

`toItemView` (`inventory.service.ts:229-247`) calls `asItemEffect`, which returns `null` on any
shape it does not recognise, logs a warning, and continues. Two consumers then read the result
as authoritative:

- `ruleset.builder.ts:40` skips the item, so it leaves `itemCatalog`. That moves `rulesetHash`,
  which invalidates every outstanding `DefenseAuthorization`.
- `snapshot.builder.ts:91` skips it too, so a pet wearing that item fights ungeared, and its
  receipt says it was ungeared.

Both happen from one malformed JSON column, with a `console.warn` as the only signal.

- [x] **C1.1** Split the read. Keep `asItemEffect`'s leniency on the display path (a bag with one
      unnamed tile beats a bag that will not open) and make the combat path strict: a
      `stat_bonus` row that fails to parse throws from `servedRuleset()` and from
      `resolveEquipment`. A deployment that cannot state its own rules should refuse to accept
      battles rather than quietly fight under different ones.
      Verify: `pnpm --filter backend test`.

## C2: an equipped item missing from the catalog fights as nothing

Same shape, different cause. `resolveEquipment` (`snapshot.builder.ts:86-109`) drops any equipped
item with no `stat_bonus`, including one with no catalog row at all. `getPetEquipment` warns and
drops it first.

The receipt then says ungeared while `ItemCore.equipmentOf(petId)` at the recorded
`sourceVersion` says otherwise. That is exactly the cross-check §4 added `itemType` to the
snapshot to enable, reporting a discrepancy an outsider cannot distinguish from operator
misbehaviour.

- [x] **C2.1** Reject the acceptance instead. An uncatalogued equipped item means the seeder is
      behind the contract, which is an operational fault; failing the accept with a named reason
      surfaces it in seconds, where a silent ungeared fight surfaces as an unexplained verifier
      failure weeks later. Reuse the existing reject path in `accept.service.ts`.
      Verify: `pnpm --filter backend test`.

## C3: the TypeScript bonus sum is unclamped where Go range-checks

`protocol/src/combat/equipment.ts:56-66`'s `sumBonuses` totals in plain JS numbers with no
ceiling; only `applyBonus` clamps, and it clamps after adding to the attributes. Go's
`SumBonuses` saturates at each step. The two agree on the final attribute value, because both
ceilings are 65535 and attributes are non-negative, so this is not a live divergence.

It does change one thing. `verify.worker.ts:117` sends the unclamped total over gRPC, and
`grpcsrv/verify.go:111-125` rejects any bonus field above 65535 rather than truncating. A total
past the ceiling becomes an RPC error, which `processVerifyMessage` correctly treats as "could
not check" rather than "disagreed", so the battle retries and dead-letters.

Unreachable with shipped content: `MAX_STAT_BONUS` is 500, three slots cap a pet at 1500, and
the shipped catalog's largest single bonus is 45 HP. This is a guardrail, not a bug.

- [x] **C3.1** Clamp in `sumBonuses` to match the Go port, and add the case to
      `contracts/test-vectors/equipment.json` so the two stay pinned. Both live ports change in
      the same commit, per `AGENTS.md`.
      Verify: `pnpm --filter @cryptopets/protocol test && go test ./internal/combat` from
      `services/indexer-go`.

      **Done without the vector case, deliberately.** The vector format hands `simulate` one
      already-summed `bonus1`/`bonus2` per pet, so no case in `equipment.json` reaches
      `sumBonuses` at all; pinning it there would have meant extending the vector schema to
      carry item lists. Both ports already pin this function with a unit test beside their
      golden tests (order-independence), so the clamp went there too:
      `equipmentVectors.test.ts`'s `saturates at 65535` and `equipment_golden_test.go`'s
      `TestSumBonusesSaturates` assert the same thing on both sides. `equipment.json` is
      untouched.

---

## D1 (decision, not a fix): consent bounds level, gear is unbounded

`DefenseAuthorization` covers pet, attacker level band, ruleset hash, validity window and daily
cap. Phase 4 made equipment a combat input without adding it to that list. A defender who
authorizes a level 10 to 14 attacker gets whatever that attacker equips afterwards, and the
snapshot is taken at accept, after consent.

Sized honestly: the shipped catalog tops out near +22 ATK against attributes in the low
hundreds, so today this is a tuning matter rather than an exploit. But `MAX_STAT_BONUS` permits
500 a stat, and the level band is the only power bound the defender was given.

Options, in the order I would take them:

1. **Bound it in the ruleset.** Add a per-fight modifier cap to `Ruleset`, so the band the
   defender consents to implies a power ceiling. Costs a ruleset schema bump and a re-consent
   event, which item D3 below already requires once.
2. **Put a gear digest in the authorization.** Strictly correct and much worse to use: the
   defender re-consents every time an attacker changes a sword.
3. **Accept it and write it down.** Defensible while the catalog stays modest. Needs a stated
   ceiling in `catalog.ts` that a content edit cannot quietly raise.

- [ ] **D1.1** Pick one. This is a game-design call, not an engineering one, and per CLAUDE.md
      it does not get decided in a loop.

## D2: drops are outside the signed payload

Recorded in `drops.ts:14-19` as a known v1 limit and correct as written: derived from the
battle's own drand seed, written in the receipt's transaction, recomputable by anyone holding
the receipt. What an outsider cannot do is *prove* a discrepancy from the receipt alone.

Listed here so it is a tracked decision rather than a comment. It needs a receipt schema
version, so it belongs with any other bump rather than on its own.

## D3: shipping Phase 4 is a re-consent event

Already recorded in `plan-inventory-items.md`. `ENGINE_VERSION` 1 to 2 plus the ruleset's item
catalog moves `rulesetHash` for every battle, so every outstanding `DefenseAuthorization` is
invalidated and every defender re-consents once. Intended behaviour, user-visible, ships
deliberately. If D1 lands as option 1, fold it into the same rollout and pay this once.

---

## Code quality

Small, none of them urgent.

- [x] **Q1 Two caches, one reset each.** `inventory.service.ts:205` caches the catalog for the
      process's life and `ruleset.builder.ts:30` caches a ruleset derived from it. Their reset
      seams are separate (`resetItemCatalog`, `resetServedRuleset`), so clearing one leaves the
      other holding data built from what was just dropped. Have `resetItemCatalog` clear both.
- [x] **Q2 Orphaned doc comment.** `env.ts:141-146` documents `adminWallets` directly above the
      comment for `dropsEnabled`; the field itself is at line 156. Move the comment to its field.
- [x] **Q3 `verify.worker.ts:60-62` casts to `Record<string, unknown>`** to read a shape the
      codec from B1.1 will type properly. Folded into B1.1 rather than done twice.

## Operational, unblocked by code

Carried over from `plan-inventory-items.md`'s "still outstanding", still outstanding. All three
are operator calls.

- [ ] **O1 Apply the migration.** `20260807160000_add_inventory` has never run. RLS is correctly
      present on all four new tables (`migration.sql:78-81`). `pnpm --filter backend prisma:migrate`,
      which is `migrate deploy`, never `dev`.
- [ ] **O2 Run the seeder,** then `scripts/verify-inventory-setup.ts` to confirm the on-chain slot
      registrations and `item_definition` agree. The chain half was registered directly during the
      Base Sepolia deploy because the table did not exist; the seeder is idempotent and will find
      every slot already correct.
- [ ] **O3 End-to-end, once.** The check at the end of `plan-inventory-items.md`. Neither web
      screen has been opened against real data and the `ItemCore` write client is stubbed in every
      test, so the first real exercise of grant, claim, equip, fight, verify is still ahead. Do it
      after B1, or it will fail at signing regardless of anything inventory does.

---

## Order

B1 first and alone: nothing settles until it lands, so every other check runs against a stalled
pipeline. Then C1 and C2 together (one theme, adjacent code). C3 with its vector case. D1 needs
an answer before D3 is scheduled, since they should ship as one re-consent. O1 to O3 last,
because they are the only steps that touch production.

## Do not touch

- `contracts/test-vectors/{battle,xp,equipment}.json`. Nothing here is a vector failure.
- Solana's frozen ports (`game/battle_sim.rs`, `game/xp.rs`).
- The snapshot and ruleset encoders. Both handle their two versions correctly; B1 is a caller
  that stopped telling them which version it held.
