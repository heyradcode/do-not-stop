# Plan: harden the battle + inventory seam before it goes live

Review of the shipped roadmap §4 work (`docs/plan-inventory-items.md`, all four phases marked
complete) against the backend-authoritative battle path (`docs/battle-protocol.md`). This file
is the execution order for what that review found. Each step ends at a command that passes.

Branch: `fix/battle-inventory-seam`.

## Status

Every code item is done. What remains needs a decision or production access, not more code.

| | Item | State |
|---|---|---|
| B1 | Sign worker rebuilt every snapshot at schema v1, so nothing settled | done |
| C1 | Unreadable catalog effect silently re-priced the ruleset | done |
| C2 | Uncatalogued equipped item fought as nothing | done |
| C3 | TS bonus sum unclamped where Go range-checks | done |
| C4 | Self-battle silently swallowed one of its own drops | done |
| C5 | Unconfirmed mint could pay an entitlement twice | done |
| C6 | Spending a consumable left the pet's own numbers stale | done |
| D1 | Consent and gear. Smaller gap than first stated | done, no schema change |
| D2 | Drops are not verifiable | claim corrected, v1 position taken and disclosed; **revisit at phase 04** |
| D3 | Phase 4 ships a re-consent event | **needs a deliberate rollout** |
| Q1-Q4 | Cache reset, stranded comment, worker cast, untypechecked scripts | done |
| O1-O3 | Migration, seeder, end-to-end | **operator calls** |

Two of these were corrections to this document rather than to the code. D1 and D2 were both
written up as bigger than they are, and in D1's case that nearly bought a permanent protocol
schema version. Where that happened it is recorded in place, because the correction is the
more useful artifact.

## Verdict

The feature is well built. Ownership boundaries are stated and held (indexer writes the
projections, the seeder writes the catalog, the player signs the equip), the two live combat
ports move together, the golden vectors cover the modifier ordering at a one-point margin, and
the doc comments record reasoning rather than restating code.

Every suite was green **as found**, which is the point worth keeping:

| Suite | As found | After |
|---|---|---|
| `pnpm --filter backend test` | 914 passed / 89 files | 939 |
| `pnpm --filter @cryptopets/protocol test` | 595 passed / 34 files | 604 |
| `pnpm --filter @cryptopets/verifier test` | 86 passed / 13 files | 86 |
| `pnpm --filter frontend test` | 370 passed / 48 files | 370 |
| `pnpm --filter @shared/core test` | 567 passed / 80 files | 568 |
| `go test ./internal/{combat,evm,store}` | ok | ok |

A green suite is not the same as working software, and B1 is the clean demonstration: no
battle on any deployment running that code could produce a receipt, and 914 tests passed
anyway, because the fixture and the bug shared an assumption. Every fix below is paired with a
test verified to fail without it, which is the only way that assertion means anything.

`contracts/test-vectors/` is unchanged throughout, confirmed by diff against `main`.

Severity ordering below is by consequence, not by size of fix. The C-numbers are in the order
found, not in severity order: C4 through C6 came out of reviewing the drop and claim paths
after the snapshot work was finished.

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

## D1: consent already bounds gear. The gap was smaller than stated

**The framing above this line was wrong, and the correction is the useful part.** Written out
because it was believed long enough to nearly justify a permanent ruleset schema version.

The original claim was that `DefenseAuthorization` bounds the attacker's level but not their
gear, leaving a defender exposed to whatever the attacker equips after consenting. Two things
already in the code say otherwise:

- **`itemCatalog` is inside `rulesetHash`** (ruleset schema v2), and consent is bound to that
  hash. So a defender has consented to the exact set of items and their exact effects,
  including the strongest loadout that set can express. Shipping a stronger sword moves the
  hash and re-consents everyone. That is the mechanism §4 designed, working.
- **`verifier/src/checks/equipment.ts` already enforces it**, comparing every resolved
  modifier in the snapshot against what the ruleset declares, per item and per slot.

So gear is bounded, the bound is signed, and the modifiers are checked against it. What
actually remained was narrower:

1. The ceiling is *derivable* (compute best-in-slot across the catalog) rather than legible as
   a single number a defender could read.
2. The catalog comparison happened only at verification, so a disagreeing snapshot became a
   failed receipt rather than a refused battle.

A `Ruleset.maxEquipmentBonus` field would have bought mostly (1), at the price of a permanent
entry in `SUPPORTED_VERSIONS` and a second re-consent event. Not proportionate.

- [x] **D1.1 Make the comparison at acceptance, with no schema change.** `findEquipmentMismatches`
      moved into `@cryptopets/protocol` (`ruleset/equipmentCheck.ts`) and now has two callers:
      the verifier, reporting on a finished receipt, and `accept.service.ts`, refusing a battle
      that would be guaranteed to fail that report. One implementation, because two would drift
      into a battle that accepts and then fails to verify, with the comparison itself the last
      thing anyone would suspect. New rejection: `equipment-catalog-mismatch` (503).

      This is not merely redundant with the verifier. `buildPetSnapshot` resolves the modifiers
      and `servedRuleset` publishes them, and those are two reads of the item catalog at
      different points in one accept, so a seeder run landing between them prices the fight
      from one catalog and the rules from another. Narrow, unreachable by an attacker, and
      invisible to every other check.

      Verify: `pnpm --filter @cryptopets/protocol test && pnpm --filter @cryptopets/verifier test
      && pnpm --filter backend test`.

Left open deliberately: `MAX_STAT_BONUS` is still 500 a stat against attributes in the low
hundreds, where the largest shipped bonus is 45. Lowering it is a balance call, and raising it
later widens the ceiling every outstanding authorization implies. Worth a line in `catalog.ts`
saying so.

## C4: a self-battle silently swallowed one of its own drops

Found after the C1 to C3 work, reviewing the drop path rather than the snapshot path.

`item_entitlement`'s unique key is `(sourceRef, owner, itemType)` and `sourceRef` is the
battle id, which is what makes a retried receipt transaction idempotent. `recordBattleDrops`
inserted the winner's and the loser's drop as separate rows under `skipDuplicates: true`, and
its comment argued the two could never collide because "each side rolls at most one item".

That holds only while the two sides are different wallets. Nothing forbids a player fighting
two pets they both own: `assertBattleSnapshot` refuses a pet fighting *itself*, and the
defender's own wallet can sign the authorization. Then winner and loser are one wallet, and
when both rolls land on the same item the two entitlements share a key, so `skipDuplicates`
keeps one and the player loses an item they earned.

Measured on the shipped pool, scanning 500 battle ids with both rates forced to certainty:
**82 collided**, about one in six. At the real rates (25% winner, 5% loser) both sides pay in
roughly 1.25% of battles, so this reaches about one self-battle in 500. Small, silent, and
wrong in the player's disfavour.

- [x] **C4.1** Merge drops by `(normalized owner, itemType)` before writing, so the case
      becomes one row of quantity 2 rather than two rows one of which vanishes. Normalizing
      inside the merge rather than at the insert, because the owner is part of the key: two
      spellings of one address are one wallet to the index and would be two groups to anything
      grouping on the raw value. `recordBattleDrops` now returns what it wrote rather than what
      it rolled.
      Verify: `pnpm --filter backend exec vitest run tests/features/inventory/drops.test.ts`.

`rollDrops` is unchanged, deliberately. It is the pure derivation of what a battle owed each
side; reconciling two owed drops with one storage key is the writer's job, not the
derivation's.

## C5: an unconfirmed mint could pay an entitlement twice

`claimEntitlement` marks the row claimed, mints, and on failure releases the claim so the
player can retry. Its comment justified the release as "safe because the mint did not land:
the client waits for a receipt and treats a reverted one as a throw."

That covers two of the three ways the mint can fail and misses the third. A revert is a
definite no, and so is a send that never left. But `waitForTransactionReceipt` throwing means
the outcome is *unknown*, not failed: the transaction is broadcast and very likely mined. The
release then hands the player a retry that mints a second time, and `txHash` was never
written, so the `txHash: null` guard on the release did not stop it either.

Narrow (it needs the RPC to drop between broadcast and receipt) but it pays out real items,
and RPC flakiness on this deployment is documented: `plan-inventory-items.md` records drpc
returning intermittent 500s on `eth_getTransactionCount` during the Base Sepolia deploy, which
is why the backend points at `sepolia.base.org` instead.

- [x] **C5.1** Sort the failures by what is actually known. `send` now raises
      `UnconfirmedTxError` carrying the hash when the broadcast succeeded but the receipt
      could not be read; everything else keeps throwing plainly. `claimEntitlement` records
      the hash and leaves the row claimed for that case only, so the worst outcome is one
      entitlement stuck pending until someone reconciles it, rather than one item minted
      twice.
      Verify: `pnpm --filter backend exec vitest run tests/features/inventory/inventory.write.test.ts`.

`useItem`'s burn takes the same client and is deliberately left as it was. Its ordering is
already the conservative one its doc comment describes: an unconfirmed burn costs the player
an item and gives nothing, which is a bad afternoon, where the reverse is a repeatable
exploit.

## C6: using a consumable left the pet's own numbers stale

`useSpendItem` invalidated the bag and documented the rest as someone else's job: "the pet's
battle progression moved too, so the caller refreshes that itself." Neither call site in
`components/inventory/index.tsx` did.

Every effect the route accepts writes `pet_battle_progress`. `grant_xp` moves level and xp;
`clear_battle_cooldown` moves `readyAt`. So the item vanished from the bag and the pet went on
showing its old level, or, for the cooldown tonic, went on showing as resting. That last one is
the worst reading available: the player spends an item specifically to battle again, and the
UI says they still cannot.

- [x] **C6.1** Invalidate progression in the hook rather than asking callers to remember.
      `useBattleProgress` gained `battleProgressQueryKey` / `battleProgressQueryPrefix`, and
      `useSpendItem` invalidates the prefix, following `petEquipmentForPetsQueryPrefix`
      exactly and for the same reason: progression is cached per *list* of pets a screen
      asked about, and a mutation cannot know which lists exist.
      Verify: `pnpm --filter @shared/core exec vitest run tests/hooks/useInventory.test.tsx`.

The general point is worth keeping. A comment asking every future caller to pair a mutation
with an invalidation is a bug waiting for its second caller, and this one did not survive its
first. A mutation that knows what it changed should invalidate it.

## Reviewed and found clean

Recorded so a later pass does not repeat the work. Neither of these produced a change:

- **`indexer-go`'s inventory ingest.** Two watermarks, genuinely separate, so a busy balance
  stream cannot drag the equipment cursor past unread rows. Coalescing keeps the highest
  version per key across all three streams identically, which is required rather than merely
  efficient: two rows sharing a key in one `ON CONFLICT` statement is a Postgres error, not a
  silent overwrite. Watermarks are in-memory and reprimed by a full scan on restart, and the
  periodic reconcile scan covers the one real gap in `updatedAt_gt` polling, which is two
  blocks sharing a timestamp.
- **The subgraph half.** Balances are re-read through `balanceOf` rather than accumulated
  from deltas, so a missed event stales a row instead of corrupting it. Escrow-on-equip
  writes an `ItemBalance` row owned by the `ItemCore` contract itself; that is storage noise
  no player read touches, since `findBalances` filters by owner and by `quantity > 0`.

## D2 (decision): drops are not verifiable, and the reason is not a missing field

The description this section carried was wrong, in the same way D1's was, and inherited from
`drops.ts`'s own doc comment. Both said a receipt holder could recompute a drop and merely
lacked the means to *prove* a discrepancy. Neither is accurate.

`rollDrops` reads three inputs. The seed and the battle id are in the signed receipt. The
third, `DropRates`, is a constant in `drops.ts`, and the pool it draws from is
`ITEM_CATALOG` filtered to non-equipment in `catalog.data.ts`. Neither reaches the ruleset,
so neither is covered by `rulesetHash` or by anything else the receipt names. **An outsider
holding a receipt and the published bundle cannot recompute the drop at all.** Someone
reading this source can; that is not the same property.

The payout is not pinned by the receipt either. `rates` is a parameter, so the same seed and
battle id produce different answers under different odds, and no row records which applied.

That is worth stating precisely, because the first version of this paragraph overstated it.
The only production caller passes no rates, so the odds in force are `DEFAULT_DROP_RATES`, a
constant that moves by code change and deploy. Git history is a real audit trail, just not
one a receipt holder can check. The anti-grinding property survives everything here and is
worth keeping: the operator cannot re-roll a committed seed.

**That materially changes which option below is right.** "Operator-attested" is a much
stronger position when the attestation is a versioned constant in a public repository than
when it is a runtime value nobody records, and it is the former. The case for spending a
protocol schema version on this is correspondingly weaker than it looked.

What makes this a decision rather than a fix: closing it means publishing the rates and the
drop pool, which puts non-equipment items into the ruleset. §4 rules that out on purpose, and
CLAUDE.md states why, that a `rulesetHash` moving every time a collectible is added would
re-consent every defender and train players to click through the one prompt that matters. So
verifiable drops and stable consent are in direct tension, and picking between them is a
product call.

- [x] **D2.1 Make the claim honest.** Corrected in `drops.ts`, `CLAUDE.md`, and
      `plan-inventory-items.md` §5, all three of which asserted recomputability. A false
      verifiability claim is worse than a documented gap: it is the kind of thing a later
      decision gets built on, and it nearly was here.
- [ ] **D2.2 Decide the tension, or decide to keep it.** Three options, with what each
      actually costs now that the inputs are pinned down:

      1. **Keep it, and say so.** Drops are operator-attested in v1: derived from a committed
         seed the operator cannot re-roll, under odds that live in a versioned constant in a
         public repository. Cost: a line in the player-facing docs. Buys no cryptographic
         property, and forecloses nothing.
      2. **A separate drop-rules digest the receipt names.** Resolves the tension properly:
         drop rules get their own hash and version independently of consent, so publishing
         them never touches `rulesetHash`. Cost: a receipt schema version, permanently, plus
         a second published artifact to serve forever (§H).
      3. **Fold drops into the receipt.** Strongest property, highest price: a receipt schema
         version *and* the non-equipment catalog inside `rulesetHash`, which is the
         re-consent-on-every-collectible outcome §4 explicitly rejected.

      **Taken: (1).** The gap is real but narrow, and what makes it narrow is that nobody can
      grind a drop, which already holds. A permanent schema version is a poor trade for
      making a constant checkable when the constant is already public.

      Chosen rather than recommended because the decision was repeatedly deferred back, and
      (1) is the option that forecloses nothing: it adds disclosure and no protocol surface,
      so (2) or (3) remain open at their original cost. Reverse it by deleting one tooltip.

- [x] **D2.2a Disclose it where a player meets a drop.** A tooltip on the inventory's
      "Waiting to be claimed" heading, saying both halves: the drop was fixed by public
      randomness before the battle resolved and nobody can re-roll it, *and* the odds are
      not checkable against a single receipt. Saying only the first would be the marketing
      version of the same fact.
      Verify: `pnpm --filter frontend lint:check && pnpm --filter frontend test`.
- [ ] **D2.2b Revisit at roadmap phase 04, not "eventually".** The condition that changes
      this answer is a drop being worth money to someone other than the player who earned
      it, and that is already scheduled: `landing.ts` lists a "Pet and item marketplace" in
      phase 04, and the FAQ already tells players their items are tradable assets. Once an
      item has a market price, "trust the constant in our repo" stops being proportionate
      and option (2) is worth its schema version. Worth deciding *before* the marketplace
      ships rather than after, since receipts signed in between are the ones that cannot be
      upgraded.

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

- [x] **Q4 `backend/scripts/` had no compiler watching it.** `backend/tsconfig.json` includes
      `src/**/*` only, and `tsx` strips types rather than checking them, so nothing checked the
      operator scripts and four type errors had accumulated. All pre-existing and unrelated to
      this branch, but these are the files an operator points at the production database, so
      they were worth fixing before O1 rather than after.

      Fixed rather than suppressed, and each was hiding something:
      - `grant-defense-authorization.ts` narrowed a served `chainId` with `startsWith('eip155:')`,
        which narrows nothing to the compiler. Now `assertChainId`, so a malformed value is
        rejected at the boundary instead of inside the signature.
      - The same file handed ethers the protocol's own readonly EIP-712 type list. Copied now,
        rather than cast: the list is readonly because reordering it changes the digest.
      - `seed-item-catalog.ts` wrote a bare `null` to a nullable Json column. Prisma rejects
        that precisely because it cannot tell SQL NULL from JSON `null`; it wants `Prisma.DbNull`,
        which is what the reader expects.

      Kept out of the main config on purpose: `pnpm build` runs `tsc` with it, so including the
      scripts there would emit them into `dist/` and ship one-shot tools as server code. They get
      `tsconfig.scripts.json` and a `typecheck:scripts` script instead, wired into `backend`'s
      `lint`, which root `pnpm lint` already runs and `static-checks.yml` already enforces. No
      workflow change needed.
      Verify: `pnpm --filter backend lint`.

## Operational, unblocked by code

Carried over from `plan-inventory-items.md`'s "still outstanding", still outstanding. All three
are operator calls.

Prepared ahead of them: the migration SQL was reviewed (RLS on all four tables, no `FORCE`,
matching the posture every other table has), and `verify-inventory-setup.ts` gained a
`catalog can price a fight` check. That one exists because C1 turned an unreadable equipment
row into a hard refusal, so a bad `effect` column now stops every accept with
`item-catalog-stale`. The seeder cannot produce that state, which is why nothing else in the
preflight would have caught it.

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
pipeline. Then C1 and C2 together (one theme, adjacent code), then C3. D1 turned out to need no
schema change, so it no longer has to be sequenced against D3's re-consent; D3 is still a
one-time cost that Phase 4 forces on its own. O1 to O3 last, because they are the only steps
that touch production.

All of that has landed. What remains is D2.2 (decide the verifiable-drops tension, or decide
to keep it), D3 (ship the re-consent deliberately), and the three operator steps, which want
running in that order: apply the migration, seed, then exercise it end to end.

One note for whoever runs O3. It is the first time either web screen will be opened against
real data, and the review that produced C1 to C6 could not substitute for that: it read the
code, not the rendered page. Expect the remaining defects to be presentational, and expect
them to be found by looking rather than by reading.

## Do not touch

- `contracts/test-vectors/{battle,xp,equipment}.json`. Nothing here is a vector failure.
- Solana's frozen ports (`game/battle_sim.rs`, `game/xp.rs`).
- The snapshot and ruleset encoders. Both handle their two versions correctly; B1 is a caller
  that stopped telling them which version it held.
