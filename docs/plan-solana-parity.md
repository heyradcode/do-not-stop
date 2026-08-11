# Solana parity catch-up plan

Branch: `feat/solana-parity-catchup`

## Decisions (locked)

1. **Native Solana anchoring.** A new Anchor program mirrors `BattleBatchRegistry`. Solana
   battle batches do not anchor to an EVM registry.
2. **SPL token rewards.** A new SPL mint plus a Solana distributor program mirroring
   `SeasonRewardDistributor`. Solana players claim on Solana.
3. **Equipment on Solana.** Items and equipment ship on Solana, reversing
   `docs/plan-inventory-items.md:15`'s EVM-only deferral. That doc's decision table needs
   updating as part of Phase 8.

## Where Solana actually stands

Not broadly behind. `programs/cryptopets/src/lib.rs` has minting, breeding, marriage,
training, rename, transfer, species pools, XP and level-up, Metaplex Core assets, Switchboard
randomness, and 18 config setters. Battles were retired on both chains together (§L Phase 6)
and account version 7 reflects that. The battle protocol already treats Solana as first class:
`ChainId` covers `solana:<cluster>`, consent verification branches to `solana-message`, and
there is a Solana signer key slot.

Three EVM contracts have no Solana counterpart, and one backend bug makes the gap worse than
the contract inventory suggests.

## Program layout

Three programs when this is done, not one.

| Program | Contains | Upgrade authority |
|---|---|---|
| `cryptopets` (existing) | pets, breeding, marriage, **items and equipment** | retained |
| `cryptopets_registry` (new) | battle batch registry | **burned after deploy** |
| `cryptopets_rewards` (new) | season distributor, SPL vault | retained |

The split is not cosmetic.

**Items belong in the existing program.** Equip has to read the pet's Metaplex Core asset
owner (`utils::metadata::core_asset_owner`) and needs the `GlobalState` PDA's plugin authority
to freeze a geared asset. Both live in `cryptopets`. Putting items elsewhere means a CPI and a
cross-program authority delegation for every equip, buying nothing: Solana has no 24KB
bytecode ceiling forcing the EVM split.

**The registry must be its own program because its upgrade authority gets burned.**
`BattleBatchRegistry.sol` is deliberately not behind a proxy: "an upgradeable registry would
defeat the point, the operator could rewrite history by upgrading the thing that records it."
On Solana every program is upgradeable unless the authority is set to `None`, so the mirror of
that property is `solana program set-upgrade-authority --final`. That is only possible for a
program nobody will ever need to patch, which rules out sharing it with rewards or with pets.

**Rewards stays separate from the registry** for the reason the EVM version gives: keeping the
ledger away from the money means a bug in the claim path cannot corrupt the history, and
pausing claims cannot stop battles. Its upgrade authority is retained, which is precisely why
it cannot live with the registry.

## Cross-cutting facts that shape the work

- **Hashing.** Every leaf and node is legacy Keccak-256. Rust gets it from
  `solana_program::keccak::hashv`, which is the same primitive. Do not reach for SHA3 or for
  `solana_program::hash` (SHA-256); either fails every vector.
- **The reward leaf cannot be reused as-is.** `protocol/src/merkle/reward.ts:77-83` hard-fails
  anything that is not a 20-byte EVM address. Solana pubkeys are 32 bytes. This needs a
  schema-versioned second layout, and under the append-only rule v1 stays in
  `SUPPORTED_VERSIONS` permanently.
- **Metaplex Core transfers bypass the program.** `PetCore._beforeTokenTransfer` refuses to
  move a pet with a filled slot, which is what stops gear silently changing hands. On Solana a
  holder can transfer a Core asset directly through `mpl-core` without touching `cryptopets`,
  so an in-program check in `transfer_pet` is not equivalent. The freeze plugin is.
- **`PetAccount` has 8 reserved bytes left** (`state/pet.rs:67`) against `GlobalState`'s 26.
  Equipment goes in its own PDA so `PetAccount::SPACE` and `CURRENT_ACCOUNT_VERSION` (7) both
  stay put. Version 7 already cost a redeploy plus `GlobalState` reinit plus re-minted pets;
  doing that again for a feature that does not require it is avoidable.
- **`item_roster` and `pet_equipment` already have a `chain` column**
  (`schema.prisma:800-833`). No migration is needed for Solana rows, so no new RLS statement
  either.
- **One item-type numbering across both chains.** The backend catalog (`catalog.data.ts`) is
  chain-neutral and feeds `itemCatalogHash`, which feeds `rulesetHash`. If Solana numbers its
  item types independently, the hash fractures per chain and every defender consents to a
  different ruleset. Solana reuses the EVM type ids.
- **Combat needs no change.** `protocol/src/combat/equipment.ts` and
  `services/indexer-go/internal/combat/equipment.go` are already chain-blind and already
  validated against `contracts/test-vectors/equipment.json`. Do not add a Solana leg to the
  vectors: the frozen port predates equipment and is not a witness to that file.
- **Licensing.** `contracts/solana`, `protocol`, `services/indexer-go`, and `proto` are MIT.
  `backend`, `frontend`, `shared` are PolyForm. New files match the package they land in.

## Toolchain caveat

There is no `cargo`, `anchor`, `rustc`, or `solana` on PATH in this environment. Every Rust and
Anchor step below is unverified until run on a machine that has them. Phase 0 step 2 is the
only Rust change safe to review by reading alone, because it is comments.

---

# Phase 0: groundwork

No new programs, no redeploy, no account version bump. Do this first: it fixes a live defect
and makes the parity picture accurate.

### 0.1 Batch and anchor every configured chain id

`backend/src/features/battle/anchor/index.ts:58` sets the batch scope to
`env.battle.chainIds[0]`. With the default `eip155:31337,solana:localnet` (`env.ts:194`), only
the EVM chain is ever batched. Solana receipts are signed and published, then sit at
`published` forever: never batched, never anchored, so never season-eligible, since
`season.service.ts` counts anchored receipts only. The comment above that line already
describes the intended per-chain behaviour; the loop was never written.

Steps:
1. Change `startBatchAnchor` to build one context per entry in `env.battle.chainIds`.
2. Make `BATTLE_ANCHOR_*` per chain id. Keep the current single-value form parsing as
   "applies to `chainIds[0]`" so existing deployments do not break on restart.
3. Run each context on its own timer, independently. One chain's RPC being down must not
   stall the other's batching.

*Verify:* `pnpm --filter backend exec vitest run tests/battle/anchor`, plus a new case
asserting two configured chain ids each produce a batch and that a throwing anchor client for
one does not prevent the other from advancing.

### 0.2 Fix the stale parity comments in `state/pet.rs`

Four doc comments describe a program that no longer exists. This is the file people read to
judge chain parity, so wrong comments here cost more than elsewhere, and they are the likely
reason Solana reads as further behind than it is.

- line 8-12: "there is no `transfer_pet` instruction" (there is, `lib.rs:32`)
- line 38-40: `breed_count` "not yet wired on Solana" (it is)
- line 44-46: "Solana has no `train` instruction yet" (it does, `lib.rs:24`)
- line 47-49: `species_id` "`0` until species pools land on Solana" (`pool_sizes` ships)

*Verify:* `cargo test -p cryptopets` as a compile check, then read each corrected line against
its `lib.rs` entry.

### 0.3 Cover the Switchboard commit/settle paths

`Anchor.toml` loads the Switchboard fixture and notes it is "not yet exercised by tests".
Breed and mint are the two remaining async Solana flows and neither is tested through the
randomness reveal. Phases 1 and 6 both add instructions near these; going in without coverage
means a regression here is invisible.

*Verify:* `anchor test` with new cases for `commit_mint` to `settle_mint`, `commit_breed` to
`settle_breed`, and the `cancel_*` expiry path at `randomness_expiry_slots`.

---

# Phase 1: the `cryptopets_registry` program

Mirrors `BattleBatchRegistry.sol`. Stores roots and nothing else: no proof verification, no
funds, no knowledge of what a reward is.

### 1.1 Scaffold

Add `programs/cryptopets-registry/` to the existing Anchor workspace. New program id, declared
in `Anchor.toml` under `[programs.localnet]` and `[programs.devnet]`. MIT header, matching
`contracts/solana`.

*Verify:* `anchor build` produces two `.so` artifacts.

### 1.2 Accounts

```
RegistryState  seeds [b"registry"]
  admin: Pubkey
  latest_batch_number: u64
  latest_root: [u8; 32]
  latest_last_sequence: u64     // the contiguity check reads this directly
  paused: bool
  bump: u8
  _reserved: [u8; 64]

Publisher      seeds [b"publisher", publisher_pubkey]
  allowed: bool
  bump: u8

Batch          seeds [b"batch", batch_number.to_le_bytes()]
  previous_root: [u8; 32]
  merkle_root: [u8; 32]
  ruleset_set_hash: [u8; 32]
  first_sequence: u64
  last_sequence: u64
  published_at: i64
  bump: u8
```

Two deliberate differences from the Solidity version. `latest_last_sequence` is denormalized
onto `RegistryState` because reading the previous `Batch` PDA would mean passing an account
whose address the caller chooses, and the contiguity check must not depend on caller-supplied
accounts. `Publisher` is a PDA per publisher rather than a map, which is the ordinary Solana
shape and makes revocation an account close.

Reserve generously on `RegistryState`: the upgrade authority is burned in 1.6, so a field that
does not fit later cannot be added at all.

*Verify:* `anchor build`, and a unit test asserting `RegistryState::SPACE` matches the field
list.

### 1.3 `publish_batch`

Signature: `(batch_number: u64, previous_root: [u8;32], merkle_root: [u8;32], ruleset_set_hash: [u8;32], first_sequence: u64, last_sequence: u64)`.

Checks, all against on-chain state rather than trusted, in this order:
1. not paused
2. signer's `Publisher` PDA exists and `allowed`
3. `batch_number == latest_batch_number + 1`
4. `previous_root == latest_root`
5. `merkle_root != [0u8; 32]`
6. `last_sequence >= first_sequence`
7. if `latest_batch_number != 0`, `first_sequence == latest_last_sequence + 1`

Then init the `Batch` PDA at `batch_number` and update `RegistryState`. Init-not-reinit is what
makes republishing structurally impossible, on top of check 3.

`published_at` comes from `Clock::get()?.unix_timestamp`, matching the Solidity comment that
this is when the chain saw it, not the operator's own `createdAt`.

*Verify:* `anchor test` cases for each of the seven checks failing individually, plus a
three-batch happy path asserting the root chain links and sequences stay contiguous.

### 1.4 Admin instructions

`set_publisher(allowed: bool)`, `pause()`, `unpause()`, all admin-signed. Pausing does not
invalidate anything published; publication resumes exactly where it left off.

*Verify:* `anchor test` asserting a revoked publisher is refused and that unpausing resumes at
the correct next batch number.

### 1.5 Reads

`get_batch` and `is_published_root` are account reads on Solana, not instructions. No program
code needed; the backend and any verifier deserialize the `Batch` PDA directly. Note this in
the program doc comment so nobody adds view instructions out of habit.

*Verify:* a TypeScript test in `tests/` that fetches a `Batch` PDA by number and checks its
root against what `publish_batch` wrote.

### 1.6 Deploy and burn the upgrade authority

After devnet deploy and after 1.3's tests pass on the deployed program:
`solana program set-upgrade-authority <registry_id> --final`.

This is irreversible and is the whole point. Do it as a deliberate, separately reviewed step,
not as part of a deploy script. Record the transaction signature in
`contracts/solana/cryptopets/README.md`, since "the operator cannot rewrite history" is a claim
outsiders have to be able to check.

*Verify:* `solana program show <registry_id>` reports no upgrade authority.

---

# Phase 2: backend anchoring for Solana

### 2.1 Abstract the anchor client

`anchor/anchor.service.ts` is viem-typed throughout (`PublicClient`, `WalletClient`,
`readContract`, `writeContract`). Extract the chain-touching surface to an interface:

```ts
interface BatchAnchorClient {
    readHead(): Promise<{ batchNumber: bigint; root: Hex }>;
    publishBatch(batch: BatchCommitment): Promise<{ txHash: string }>;
}
```

`anchorNextBatch` keeps every piece of logic it has now (read head first, reconcile a landed
transaction whose row never updated, refuse anything but the next batch) and loses only the
viem calls. Nothing about the crash-safety reasoning is chain-specific.

*Verify:* `pnpm --filter backend exec vitest run tests/battle/anchor` unchanged and passing
against an EVM client fake.

### 2.2 EVM client

Move the current viem code behind `BatchAnchorClient` verbatim. No behaviour change.

*Verify:* same suite as 2.1, plus the existing integration path against a local Hardhat node.

### 2.3 Solana client

New implementation using `@coral-xyz/anchor`. `readHead` deserializes `RegistryState`.
`publishBatch` sends `publish_batch` signed by the anchor keypair.

Two things to get right:
- **Confirmation level.** Wait for `finalized`, not `confirmed`. A batch is the immutability
  claim; anchoring against a slot that can still be dropped defeats it.
- **Idempotency.** A send that times out but lands must not double-publish. `readHead` before
  every send already covers this, and the program's init-not-reinit on the `Batch` PDA is the
  backstop.

*Verify:* `pnpm --filter backend exec vitest run tests/battle/anchor` with a Solana client fake,
then a manual run against `solana-test-validator` with the registry deployed.

### 2.4 Config

Per chain id, from 0.1: RPC url, keypair, program id. `BATTLE_ANCHOR_SOLANA_*` in
`backend/env.example` with the same "off unless configured" default the EVM side has. A
deployment that has not funded an anchoring wallet batches but does not anchor, and says so in
the log.

*Verify:* boot the backend with Solana anchor vars unset and confirm the existing
"batches will still be built but never anchored" message appears for that chain id only.

---

# Phase 3: the reward leaf for 32-byte accounts

Must land before Phase 4, because the distributor program has to reproduce these bytes exactly.

### 3.1 Add `merkleRewardLeaf` v2

`rewardMerkleLeaf` currently rejects anything that is not a 20-byte address
(`protocol/src/merkle/reward.ts:77-83`). Add a v2 layout for 32-byte accounts:

```
keccak256(REWARD_LEAF_DOMAIN || u16(2) || u8(chainFamily) || chainRef(32)
          || distributor(32) || seasonId(32) || wallet(32) || token(32) || amount(32))
```

Fixed-width fields only, no length prefixes, matching v1's constraint so an on-chain verifier
can reproduce it without a canonical writer. The `chainFamily` byte is what makes an EVM leaf
and a Solana leaf structurally unable to collide even if every other field coincided.

**v1 stays in `SUPPORTED_VERSIONS` permanently.** Every season already published was signed
over v1 and re-encoding it under v2 would invalidate every outstanding proof. This is the
append-only rule and it is not negotiable.

*Verify:* `pnpm --filter @cryptopets/protocol test`, with a fixed vector for each version and a
case asserting a v1 entitlement still hashes to its recorded leaf.

### 3.2 Select the layout by chain family, never by build

`chainFamily(chainId) === 'solana'` picks v2. An absent version on a stored entitlement means
1, never "whatever this build implements".

*Verify:* a test that loads a stored v1 entitlement with no version field and asserts it
resolves to 1.

### 3.3 Node hashing is unchanged

`merkleNode` stays `keccak256(NODE_DOMAIN || min || max)` for both families. Only the leaf
differs. Do not domain-separate the nodes per chain: the tree shape has nothing chain-specific
in it, and two node layouts would mean two verifier code paths for no gain.

*Verify:* existing `protocol/tests/merkle` suite passes untouched.

---

# Phase 4: SPL token and the `cryptopets_rewards` program

### 4.1 The SPL mint

Create the mint with `spl-token`. Decimals to match `CryptoPetsToken.sol` so the two chains
quote the same numbers. Mint authority held by a multisig, **not** by the rewards program: the
distributor pays from a vault it holds, it does not mint. That mirrors the EVM distributor,
which only ever calls `safeTransfer` from a balance somebody deposited.

*Verify:* `spl-token display <mint>` shows the expected decimals and authority.

### 4.2 Accounts

```
Season         seeds [b"season", season_id.to_le_bytes()]
  merkle_root: [u8; 32]
  mint: Pubkey
  per_wallet_cap: u64
  season_cap: u64
  total_claimed: u64
  claims_open_at: i64
  claims_close_at: i64
  bump: u8

Claimed        seeds [b"claim", season_id.to_le_bytes(), wallet]
  bump: u8                     // existence is the nullifier
```

`Claimed` as a PDA whose existence is the flag is the Solana idiom for
`mapping(bytes32 => bool) claimed`, and it makes the nullifier derived rather than supplied for
free: the seeds are the derivation, so a claimant cannot choose it.

Vault is an associated token account owned by the `Season` PDA.

*Verify:* `anchor build`, plus a space assertion test.

### 4.3 `open_season`

Admin-signed. Init-not-reinit on the `Season` PDA gives "a season can be opened exactly once"
structurally. Refuse a zero root and refuse `claims_close_at <= claims_open_at`.

Re-posting a root is impossible even for the admin, matching the Solidity reasoning: it is the
single most valuable thing an attacker holding the admin key could do. A mistaken root is
corrected by opening a new season, visibly.

*Verify:* `anchor test` asserting a second `open_season` for the same id fails, and that a zero
root and an inverted window are both refused.

### 4.4 `claim`

Signature: `(season_id: u32, amount: u64, proof: Vec<[u8; 32]>)`. The wallet is an account, not
an argument, so the leaf binds who gets paid.

Order, effects before interactions:
1. season exists, now within `[claims_open_at, claims_close_at)`
2. `amount <= per_wallet_cap`
3. `amount <= season_cap - total_claimed`
4. rebuild the v2 leaf from program-supplied values (`season_id`, this program's id, the
   `Season` PDA's `mint`, the wallet account, `amount`) and walk the proof with
   `keccak(NODE_DOMAIN || min || max)`
5. init the `Claimed` PDA, which fails if it already exists
6. `total_claimed += amount`
7. CPI `spl_token::transfer` from vault to the wallet's ATA

The distributor and chain reference in the leaf come from the program, never from the caller,
so a proof built for devnet cannot be replayed on mainnet. Anyone may send the transaction and
pay the fee; only the bound wallet can be paid.

*Verify:* `anchor test` covering a valid claim, a double claim, a proof from a different
season, an amount over each cap, a claim before open and after close, and a claim where the
sender is not the beneficiary (must succeed, paying the beneficiary).

### 4.5 Cross-language leaf vector

Add a fixed reward-leaf vector to `contracts/test-vectors/`, checked by both
`@cryptopets/protocol` and the Anchor suite. This is the same discipline the combat vectors
enforce: two implementations of one encoding drift silently, and a drifted leaf means every
proof fails with no indication which side is wrong.

*Verify:* `pnpm --filter @cryptopets/protocol test` and `anchor test` both read the same file
and agree.

### 4.6 `sweep_unclaimed` and `pause`

Sweep only after `claims_close_at`, so it cannot pull funds from under people still entitled.
Pause blocks `claim` only.

*Verify:* `anchor test` asserting a sweep before close is refused.

---

# Phase 5: backend seasons and the claim UI

### 5.1 Season scope spans chain ids

Let a season's contribution query cover several chain ids so a player's Solana and EVM battles
count toward one season. `entitlements.ts` already works on `BattleContribution` rows; the
scoping is in the query above it.

*Verify:* `pnpm --filter backend exec vitest run tests/battle/rewards` with a fixture mixing
`eip155:` and `solana:` receipts.

### 5.2 Per-family entitlement grouping

One season, two trees: an EVM tree with v1 leaves and a Solana tree with v2 leaves, because
each binds to its own distributor. `SeasonInputs` grows from `distributor`/`evmChainId` to a
per-family distributor descriptor.

A wallet appears in whichever tree matches the chain it battled on. No address linking is
needed, which is the main thing decision 2 bought over the claim-on-EVM alternative.

*Verify:* new test asserting a season with both families produces two roots and that a Solana
wallet's leaf is absent from the EVM tree.

### 5.3 Serve proofs by family

The proof endpoint returns the tree matching the caller's chain. A Solana wallet asking for an
EVM proof gets nothing rather than a proof that cannot be claimed.

*Verify:* `pnpm --filter backend exec vitest run tests/battle/rewards`.

### 5.4 Frontend claim path

The rewards screen builds a Solana `claim` transaction when the active chain is Solana. This is
a new write, so it goes through the chain adapter the way pet actions do rather than reaching
into `frontend/src/chains/solana/` from a component.

*Verify:* `pnpm --filter frontend exec vitest run src/hooks/rewards`.

### 5.5 Verifier

`@cryptopets/verifier` learns the v2 leaf so a Solana entitlement can be checked
independently. It still depends only on `protocol`.

*Verify:* `pnpm --filter @cryptopets/verifier test`, and add a Solana case to the receipt
corpus in `.github/workflows/verifier.yml`.

---

# Phase 6: items and equipment in the `cryptopets` program

### 6.1 Accounts

```
ItemBalance     seeds [b"item", owner, item_type.to_le_bytes()]
  owner: Pubkey
  item_type: u64
  quantity: u64
  bump: u8

ItemSlot        seeds [b"item-slot", item_type.to_le_bytes()]
  slot_plus_one: u8            // 0 means not equippable, mirroring _itemSlotPlusOne
  bump: u8

PetEquipment    seeds [b"equipment", pet_asset]
  slots: [u64; 3]              // item type per slot, 0 = empty
  bump: u8
```

Three slots (weapon, armor, trinket), item type 0 reserved and not equippable, exactly as
`ItemCore` has it.

Keyed by the Core asset pubkey, not the numeric pet id, because the asset is the ownership
source of truth on this chain.

`slot_plus_one` is stored the same way and for the same reason: zero has to mean "not
equippable" rather than "weapon".

*Verify:* `anchor build` plus space assertions.

### 6.2 `equip`

Signature: `(slot: u8, item_type: u64)`.

1. signer is the Core asset owner, read via `utils::metadata::core_asset_owner`
2. `ItemSlot` for `item_type` exists and its slot matches `slot`
3. `PetEquipment.slots[slot] == 0`
4. `ItemBalance.quantity >= 1`, decrement it
5. write `slots[slot] = item_type`
6. add the mpl-core `FreezeDelegate` plugin to the asset, authority the `GlobalState` PDA

Step 6 is the Solana replacement for `PetCore._beforeTokenTransfer`. Without it a holder
transfers the Core asset directly through `mpl-core`, never touching this program, and gear
changes hands silently. There is no in-program transfer hook to hang the check on, so freezing
is the mechanism. Note this in the instruction's doc comment: it is the least obvious thing in
the phase and the easiest to remove by accident later.

There is no separate escrow account. Decrementing `ItemBalance` and recording the type in
`PetEquipment` is the escrow, which is simpler than ERC-1155's transfer-to-self and gives the
same property: the equip record is itself the ownership proof, so "was this gear on this pet at
snapshot time" is answered by chain state at a recorded version.

*Verify:* `anchor test` for a non-owner refused, wrong slot refused, filled slot refused,
insufficient balance refused, and a direct `mpl-core` transfer of a geared asset refused by the
freeze.

### 6.3 `unequip`

Signature: `(slot: u8)`. Signer must be the current asset owner. Clears the slot, increments
the owner's `ItemBalance`, and removes the freeze plugin **only when every slot is empty**.

Paying the current owner rather than whoever equipped it is the same rule `ItemCore.unequip`
applies, and for the same reason: it stops an item being stranded behind a pet its equipper can
no longer reach.

*Verify:* `anchor test` for an empty slot refused, a non-owner refused, freeze retained while
another slot is still filled, and freeze removed on the last unequip.

### 6.4 `register_item_slot` and `clear_item_slot`

Admin-signed, mirroring `ItemCore`'s owner gating. Re-registering to a different slot is
allowed and does not disturb anything already equipped, which stays where it was put until
unequipped.

*Verify:* `anchor test` asserting item type 0 is refused and slot >= 3 is refused.

### 6.5 `mint_items` and `burn_items`

Authorized-caller gated, matching `ItemCore.onlyAuthorized`. Add an `authorized_callers`
set to `GlobalState` or a `Authorized` PDA per caller; the PDA is the better fit given
`GlobalState`'s 26 reserved bytes.

`burn_items` must refuse burning from an equipped position. On EVM the guard is
`from != address(this)`; here the equivalent is that escrowed quantity is not in any
`ItemBalance` at all, so it is unreachable by construction. State that in the doc comment so
nobody adds an "unequip and burn" convenience that reintroduces the hazard: a burned equipped
item would leave `PetEquipment` naming a type nobody holds, and every snapshot would keep
resolving its modifier. The receipt would still verify, because the catalog still declares the
item, so the damage is a phantom combat bonus that passes every check.

This is a real trust grant, the same one the EVM side documents: an authorized caller can burn
any wallet's items. That key belongs nowhere shared.

*Verify:* `anchor test` for an unauthorized signer refused and for a burn exceeding balance
refused.

### 6.6 Block `transfer_pet` on geared pets

The existing in-program `transfer_pet` gets the same check for completeness, even though the
freeze plugin is what actually enforces it. Two guards that agree cost nothing; the freeze
alone would leave `transfer_pet` failing with an opaque mpl-core error instead of a named one.

*Verify:* `anchor test` asserting `transfer_pet` on a geared pet fails with the program's own
error code.

---

# Phase 7: indexer projections for Solana items

### 7.1 Solana inventory adapter

`services/indexer-go/internal/evm/inventory.go` has no Solana counterpart. Add one under
`internal/solana/`, following the rules the roster already follows:

- its **own watermark**, separate from the roster's. A shared cursor advanced by the busy
  stream skips the quiet one's unread rows permanently.
- the monotonic `last_version` guard on every upsert.
- **never delete a row.** A spent stack writes `quantity 0` and an emptied slot writes
  `item_type "0"`. Zero is a value, not an absence.

Solana's adapter is WebSocket push plus backfill, unlike EVM's subgraph pull, so "version" is
the account's slot rather than a subgraph `updatedAt`. Use the slot consistently for both item
tables or the guard compares incomparable numbers.

*Verify:* `go test ./internal/solana` with decode fixtures for `ItemBalance` and
`PetEquipment`, and `go vet ./...`.

### 7.2 IDL

`internal/solana/idl/cryptopets.json` drives **positional Borsh decoding**. It is currently in
sync with `PetAccount` field for field. Adding accounts must not disturb that.

Re-diff the hand-edited file against what `anchor build` generates, field by field, before
committing. An IDL listing fields in the wrong order misaligns everything after them and
corrupts silently.

*Verify:* dump the generated IDL, diff field order against the committed file, and run
`go test ./internal/solana` which decodes against fixtures.

### 7.3 No migration

`item_roster` and `pet_equipment` are already keyed by `chain` (`schema.prisma:800-833`). No
new table, so no new RLS statement. Confirm the Solana adapter writes `chain = 'solana'`
matching what the roster writes, or the join in `inventory.service.ts` silently returns
nothing.

*Verify:* insert a Solana equipment row via the indexer against a scratch database and read it
back through the backend's inventory endpoint.

---

# Phase 8: frontend, backend catalog, and docs

### 8.1 Solana inventory adapter

`shared/src/hooks/adapters/useInventoryAdapter.ts:11-14` mounts a disabled adapter for Solana
with the reason "that chain has no item contract". Replace that branch with a real
implementation. Keep the disabled adapter for "no wallet connected", which is still a genuine
case.

*Verify:* `pnpm --filter frontend exec vitest run src/hooks/inventory`.

### 8.2 Strict catalog reads apply unchanged

`getCombatCatalog` and `getPetEquipmentForCombat` throw rather than hiding an unreadable row,
and `servedRuleset` and `snapshot.builder` use those. Solana equipment enters through the same
path, so `item-catalog-stale` rejection behaviour needs no change. Confirm rather than assume:
an uncatalogued Solana item must produce that rejection, not a bare-pet snapshot.

*Verify:* `pnpm --filter backend exec vitest run tests/battle/ledger/snapshot`.

### 8.3 Ruleset rollout

Adding Solana items to `servedRuleset()` moves `rulesetHash` and invalidates every outstanding
`DefenseAuthorization`. `servedRuleset` caches for the process's life, so this needs a restart.
Ship it as a deliberate rollout, announced, not as a catalog row edit that quietly re-prices
live battles.

*Verify:* confirm the new `rulesetHash` is served after restart and that a battle held under
the old hash is refused rather than silently re-priced.

### 8.4 Documentation

- `docs/plan-inventory-items.md:15`: change the Chains row from "EVM only. Solana deferred" and
  add a Built banner recording the reversal.
- `docs/battle-protocol.md` §I: record that anchoring is per protocol chain id, each against
  its own registry on its own chain, and that reward leaves are v1 for EVM and v2 for Solana.
- `CLAUDE.md`: the inventory section says `item_roster` and `pet_equipment` are EVM-only. Update
  it, and update the Solana section to list the two new programs.
- `contracts/solana/cryptopets/README.md`: the registry's burned upgrade authority transaction
  signature, per 1.6.

*Verify:* `pnpm lint` and re-read each edited claim against the code it describes.

---

# Suggested order and checkpoints

| Order | Phase | Blocks |
|---|---|---|
| 1 | 0 | everything (0.1 is a live defect) |
| 2 | 1, 2 | Solana receipts stop stranding |
| 3 | 3 | Phase 4 cannot start without the v2 leaf |
| 4 | 4, 5 | Solana players can be paid |
| 5 | 6 | equipment on chain |
| 6 | 7, 8 | equipment reaches combat and the UI |

Phases 1 through 5 and phase 6 through 8 are independent of each other. If two people are
working, that is the split.

**Checkpoint after Phase 2:** query `battle_receipt` for
`chainId LIKE 'solana:%' AND batchId IS NULL` and confirm it drains to zero. That number not
moving means 0.1 did not take.

**Checkpoint after Phase 5:** a Solana wallet claims a test season on devnet end to end, and
`@cryptopets/verifier` independently confirms the entitlement from the public corpus.

**Checkpoint after Phase 8:** a Solana pet equips an item, fights, and the receipt's
`equipment` check passes in the standalone verifier. That is the one that proves the whole
chain of work, because it exercises the program, the indexer projection, the snapshot, the
ruleset hash, and replay together.

## Not in scope

- Touching `game/battle_sim.rs` or `game/xp.rs`. They are frozen. With `CombatSim.sol` deleted
  they are the only remaining independent witness that
  `contracts/test-vectors/{battle,xp}.json` describe what actually settled on chain.
- Reviving Solana battles on chain. Both chains take the backend-authoritative path.
- Adding a Solana leg to `contracts/test-vectors/equipment.json`. The two live ports already
  cover it and the frozen port predates equipment.
- A marketplace, crates, or any acquisition path beyond battle drops and admin grants.
