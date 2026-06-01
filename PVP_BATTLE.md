# PvP Battles — Battle Other Players' Pets (step-by-step)

> Goal: today you can only battle your **own** pets. Enable battling **other
> players'** pets. Status: **plan**.

---

## 0. The key realization (read this first)

Your **contracts already support cross-owner battles.** The restriction is
entirely in the frontend. Proof:

| Layer | What it enforces today | Cross-owner? |
|-------|------------------------|--------------|
| EVM `Battle.fight(id1, id2)` (`contracts/ethereum/src/Battle.sol:24`) | both pets exist + ready. **No `onlyOwner`.** | ✅ already allowed |
| Solana `commit_battle` (`...instructions/commit_battle.rs`) | attacker signs + owns attacker pet; `defender_owner` is `UncheckedAccount` (no signature) | ✅ already allowed |
| Frontend `BattlePanel` (`battle-panel/index.tsx:101`) | both dropdowns filled from `usePetList()` = **your wallet only** | ❌ **this is the blocker** |

**Conclusion:** the off-chain work is **opponent discovery / matchmaking**, not
battle resolution. You need a way to *find and list other players' pets*, then
let the user pick one as the opponent. No contract change is required for a basic
version.

> ⚠️ **Two things to decide before coding** — see §6 (consent model) and §7
> (RNG fairness). They don't block the MVP but you must be aware of them.

---

## 1. Decide the consent model (product decision, 5 min)

Pick one. The MVP plan below assumes **A** because it matches your contracts.

- **A. Open PvP (no consent).** Attacker picks any ready opponent and battles
  immediately. Matches current contracts → least work. Downside: a player's pet
  can lose/get a cooldown without them acting.
- **B. Challenge / accept.** Attacker sends a challenge; defender must accept.
  Fairer, but needs a challenges table (off-chain) and, ideally, contract changes
  so the defender signs. Defer to a later phase.

> Recommendation: ship **A** first (it's mostly frontend + an indexer), add **B**
> later if you want fairness/escrow/wagers.

---

## 2. Phase 1 — Off-chain pet roster (the indexer)

The frontend needs to *see* pets it doesn't own. Build a backend service that
maintains a roster of all pets across all owners. This is the "off-chain logic"
you intuited.

### Step 2.1 — Add a database to the backend
Your backend is currently in-memory. Add Postgres (Render PG or Supabase) and a
single table:

```sql
CREATE TABLE pet_roster (
  chain        TEXT    NOT NULL,        -- 'evm' | 'solana'
  pet_id       TEXT    NOT NULL,        -- on-chain id (string)
  owner        TEXT    NOT NULL,        -- address / pubkey
  name         TEXT    NOT NULL,
  level        INT     NOT NULL,
  rarity       INT     NOT NULL,
  dna          TEXT    NOT NULL,        -- bigint as string
  win_count    INT     NOT NULL,
  loss_count   INT     NOT NULL,
  ready_at     BIGINT  NOT NULL,        -- unix seconds
  updated_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (chain, pet_id)
);
CREATE INDEX ON pet_roster (chain, owner);
```

### Step 2.2 — EVM indexer
Reuse the data your contract already exposes (no contract change):
1. On startup, read `getTotalCount()` and loop `getById(i)` + `ownerOf(i)` for
   `i = 1..total` → upsert each row.
2. Keep it fresh by subscribing to events you already emit: `FightResult`,
   `PetTransferred`, `BreedFulfilled`, ERC-721 `Transfer`. On each, re-read the
   affected pet(s) and upsert.
3. Simplest first version: skip event subscription, just **re-scan on a timer**
   (e.g. every 30s). Optimize to events later.

> You already have a watcher pattern to copy: `scripts/vrf-fulfill-watcher.ts`
> shows how to connect and listen with viem/ethers.

### Step 2.3 — Solana indexer
1. `connection.getProgramAccounts(programId, { filters: [discriminator of PetAccount] })`.
2. Decode each `PetAccount` with your Anchor IDL (the same decoding
   `shared/src/utils/solana/accountClient.ts` already does).
3. Upsert rows (owner = `pet.owner`, id = `pet.id`).
4. First version can re-scan on a timer; later switch to `onProgramAccountChange`.

### Step 2.bis — Alternative EVM source: a subgraph (The Graph)

The polling indexer in §2.2 is the pragmatic choice for **local dev** and a
**dual-chain** app. On a real testnet/mainnet, a **subgraph** is the more
"correct" EVM indexer. The important design idea: keep `pet_roster` +
`rosterRepository` + the endpoint as the **stable interface**, and treat the
*source* feeding the table as pluggable.

```
                       ┌─ evmIndexer    (poll RPC)      ← now, local dev
pet_roster ◄─ upsert ──┤─ subgraphIndexer (GraphQL)     ← later, testnet/mainnet EVM
   (unified store)     └─ solanaIndexer (anchor)        ← Solana, always custom
                              │
                  GET /api/battle/opponents  (unchanged)
```

So a subgraph would mean adding a `subgraphIndexer.ts` that queries the
subgraph's GraphQL and upserts into the **same** table — the endpoint,
`useOpponents`, and the UI never change.

**Why not subgraph-only / now:**
1. **EVM-only.** The Graph indexes EVM cleanly; Solana needs the heavier
   Substreams/Firehose path (different toolchain). You'd still need the custom
   `solanaIndexer`, so the unified backend matters.
2. **Local dev.** The hosted/decentralized Graph network can't index
   `localhost:8545`. Local use requires running a dockerized `graph-node` + IPFS
   + Postgres against the Hardhat node, and redeploying the subgraph on each
   contract redeploy — more moving parts than the poller.
3. **Sparse events.** `createRandom` emits no dna/rarity, and
   `levelUp`/`changeName`/`changeDna` emit nothing, so subgraph mappings would
   fall back to `getById()` calls anyway — eroding the event-driven advantage.

**To make a subgraph shine, improve contract events** (a contract change — pair
it with the §7 VRF migration): emit `PetCreated(id, owner, dna, rarity)`,
`LevelUp(id, level)`, `NameChanged(id, name)`. Then mappings build complete
`Pet` entities with **zero** contract calls, and the subgraph is clearly better
than polling on EVM.

**Rough shape if/when you add it:**
- `schema.graphql`: a `Pet` entity (id, owner, name, dna, level, rarity,
  winCount, lossCount, readyAt).
- `subgraph.yaml`: data source = CryptoPets address + ABI; handlers for
  `Transfer` (mint/owner change), `FightResult`, `BreedFulfilled`, and (after
  the event work) `PetCreated`/`LevelUp`/`NameChanged`.
- AssemblyScript mappings that `Pet.load/save`, reading missing fields via
  `getById()` until the events exist.
- `subgraphIndexer.ts`: GraphQL query (filter by ready/level, paginate) → map →
  `upsertPet()`. Or, leaner, have the endpoint query the subgraph directly for
  EVM — but that splits EVM/Solana across two mechanisms and you lose the single
  queryable source, so prefer feeding `pet_roster`.

> Decision: **poller now** (local + dual-chain). **Subgraph later** for
> production EVM, swapped in behind the same `pet_roster` interface. Solana stays
> a custom anchor indexer either way.

### Step 2.4 — Expose the matchmaking endpoint
Add to the backend (JWT-protected, reusing your existing auth):

```
GET /api/battle/opponents?chain=evm&excludeOwner=0xMe&minLevel=1&page=0
→ { opponents: [
      { chain, petId, owner, name, level, rarity, winCount, lossCount, readyAt }
    ], total }
```

Rules: exclude `excludeOwner` (the caller — read it from the JWT, don't trust the
query), only return **ready** pets (`readyAt <= now`), paginate. Optional filters:
level range, rarity, sort by similar level for fair matches.

---

## 3. Phase 2 — Shared layer (`@shared/core`)

### Step 3.1 — Type for an opponent
```ts
// shared/src/types/pet.ts
export interface OpponentPet extends Pet {
  owner: string;   // the OTHER player's address/pubkey — needed for Solana PDAs
}
```

### Step 3.2 — `useOpponents()` hook
Mirror your existing hooks. It calls the new endpoint via the API client you
already have (`createAuthApiClient` / `useApiClient`) and returns
`{ opponents, isLoading, refetch }`. Use TanStack Query (your `queryClient`).

### Step 3.3 — Thread the opponent's owner through `useBattlePets`
This is the one real code change to existing logic. Today
`BattlePetsArgs = { petId1, petId2 }`. Solana needs the **defender's owner**
to derive the defender pet PDA. Extend it:

```ts
export interface BattlePetsArgs {
  petId1: string;                 // attacker (caller-owned)
  petId2: string;                 // defender
  defenderOwner?: string;         // REQUIRED on Solana for cross-owner battle
}
```

- **EVM path** (`useBattlePets.ts:76`): unchanged — `fight(id1, id2)` takes global
  ids, no owner needed.
- **Solana path** (`useBattlePets.ts:79`): pass `defenderOwner` down to
  `solanaActions.battlePets.mutateAsync`.

---

## 4. Phase 3 — Solana action wiring

The Solana `commit_battle`/`settle_battle` accounts include `defender_owner` and
the defender pet PDA derived from `[PetAccount::SEED, defender_owner, pet_id]`.

### Step 4.1 — Make the action accept `defenderOwner`
In `shared/src/hooks/chains/solana/usePetActions.ts` (and
`utils/solana/battleWithSwitchboardVrf.ts`), the battle builder currently almost
certainly derives the defender PDA from the **connected wallet**. Change it to
derive from a passed-in `defenderOwner` pubkey:

```ts
const defenderOwnerPk = new PublicKey(defenderOwner);
const defenderPetPda = derivePetPda(defenderOwnerPk, defenderPetId); // pdas.ts
// pass defenderOwner (UncheckedAccount) + defenderPetPda into commit/settle
```

### Step 4.2 — Verify the existing PDA helper
`shared/src/utils/solana/pdas.ts` already derives pet PDAs from `(owner, id)`.
Make sure the battle path uses `defenderOwner`, not the signer, for the defender
side. (EVM needs none of this.)

---

## 5. Phase 4 — Frontend UI (`battle-panel`)

Turn the second dropdown into an **opponent picker** fed by other players' pets.

### Step 5.1 — Keep "First Fighter" = your pets
No change: still from `getReadyPetsUnified(pets)` (your own, ready pets).

### Step 5.2 — Replace "Second Fighter" source
- Call `useOpponents()` instead of filtering your own list.
- Render each option as `name (Lv.N) · 0x12…ab` so the owner is visible.
- Store both the opponent `petId` **and** its `owner`.

### Step 5.3 — Pass the opponent owner into mutate
```ts
void battle.mutate({
  petId1: selectedMyPetId,
  petId2: opponent.petId,
  defenderOwner: opponent.owner,   // ignored by EVM, required by Solana
});
```

### Step 5.4 — UX niceties (optional)
- Show opponent win/loss + level next to each option for "fair fight" picking.
- A "Find opponent" / "Random ready opponent" button that picks one near your
  level from the roster.
- After battle, `refetch()` opponents too (their stats changed).

---

## 6. Phase 5 (optional, later) — Challenge / accept + stakes

Only if you chose consent model **B** or want wagers. This **does** need contract
work:

1. **Off-chain:** a `challenges` table + endpoints (`POST /challenges`,
   `POST /challenges/:id/accept`, list incoming/outgoing). Notify via polling.
2. **On-chain (fairness):** require the defender to sign acceptance. On Solana,
   make `defender_owner` a `Signer` in a new `accept_battle` step. On EVM, add a
   signature/commit so `fight` can't be forced by a stranger.
3. **Wagers/escrow:** optional — both sides lock a stake; winner takes it. Real
   contract changes + audits.

---

## 7. ⚠️ RNG fairness — important for real PvP

This matters once strangers (not you) are on both sides:

- **EVM `Battle.fight` uses `utils.randMod(100)`** — on-chain pseudo-randomness
  (likely block/tx-derived). For battles between **your own** pets this is fine.
  For **adversarial PvP it is exploitable**: a caller can simulate the tx and only
  submit when they'd win, or a validator can influence it. **Recommendation:**
  move EVM battle to **Chainlink VRF** (commit/settle), exactly like your breeding
  already does in `CryptoPets.sol`. This is the biggest correctness change for
  serious PvP.
- **Solana battle already uses Switchboard VRF** (commit/settle) — good, no change
  needed there.

You can ship the MVP (§1–5) with the current EVM RNG for a demo, but flag this and
do the VRF migration before any stakes/real competition.

---

## 8. Suggested order of work (smallest shippable first)

1. **§2.4 stub:** hardcode an opponents endpoint returning a couple of seeded
   rows → unblock frontend immediately.
2. **§5:** wire the opponent picker + `defenderOwner` threading (§3.3, §4) → you
   can now battle a known opponent end-to-end on Solana, and any id on EVM.
3. **§2.2 / §2.3:** real indexer (timer-scan version) → the roster becomes live.
4. **§2.2 events / §2.3 subscriptions:** make the roster real-time.
5. **§7:** EVM battle → VRF (before real stakes).
6. **§6:** challenge/accept + wagers (only if desired).

---

## 9. Checklist of files to touch

**Backend (new):**
- DB migration for `pet_roster` (+ later `challenges`)
- `src/indexer/evm.ts`, `src/indexer/solana.ts`
- `src/routes/battle.ts` → `GET /api/battle/opponents`
- mount in `src/app.ts`

**Shared (`@shared/core`):**
- `src/types/pet.ts` → add `OpponentPet`
- `src/hooks/useOpponents.ts` (new) + export in `hooks/index.ts`
- `src/hooks/useBattlePets.ts` → add `defenderOwner` to `BattlePetsArgs`
- `src/hooks/chains/solana/usePetActions.ts` + `utils/solana/battleWithSwitchboardVrf.ts` → use `defenderOwner` for defender PDA

**Frontend:**
- `components/pet/interactions/battle-panel/index.tsx` → opponent picker + pass `defenderOwner`

**Contracts (only Phase 5 / §7):**
- `contracts/ethereum/src/Battle.sol` → VRF-based fight (commit/settle)
- Solana: `accept_battle` instruction (only for consent model B)

---

*MVP = §1 (model A) + §2 + §3 + §4 + §5. That gives cross-player battles with the
contracts you already have. §6 and §7 are the "make it competitive and fair"
follow-ups.*
