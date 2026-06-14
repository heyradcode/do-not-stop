# Smart Contract Upgrade Plan — Realistic Battle & Breeding, Upgradeable on EVM + Solana

Goal: take the current devnet-grade contracts to an "almost complete" v2 with
realistic battle/breeding mechanics and concrete economic parameters, while
making both stacks safely upgradeable for the future.

Scope: `contracts/ethereum/src/*` (Solidity 0.8.24, Hardhat, Chainlink VRF
v2.5) and `contracts/solana/cryptopets` (Anchor, Switchboard On-Demand
randomness). Indexer-go and the subgraph follow each phase.

---

## 1. Where we are (honest assessment)

| Area | EVM | Solana |
| --- | --- | --- |
| Battle outcome | flat 70% attacker win (`Battle.sol:14`) | flat 70% (`state.rs:6`) |
| Battle randomness | `Utils.randMod` — keccak(timestamp, sender, nonce), **predictable/manipulable** | Switchboard commit→settle ✅ |
| Battle authorization | **none** — anyone can `battle()`/`attack()` with anyone's pets | attacker must sign; defender does **not** consent |
| Breeding randomness | Chainlink VRF v2.5 ✅ | Switchboard ✅ |
| Breeding rules | parents ready + not self; no fee, no generations, no ownership check | same |
| Leveling | +1 level per win, unbounded; paid `levelUp` by anyone | +1 level per win, unbounded |
| Rarity effect on combat | **none** — rarity is computed and stored but never read by battle logic | **none** — same |
| Cooldowns | 5 seconds (dev value) | 5 seconds (dev value) |
| Pause | ❌ | ✅ |
| NFT standard | ERC-721 ✅ | ❌ bare program PDAs — invisible to wallets/marketplaces; transfer is a custom burn-and-recreate instruction |
| Upgradeability | ❌ — `CryptoPets` constructor `new`s all modules; everything immutable | ✅ by default (BPF upgradeable loader), but account layouts have almost no reserved space |
| Cheats | `changeDna` lets a level-20 pet set **arbitrary DNA** (= arbitrary rarity/stats); `createRandom` DNA derives from grindable entropy (mine names until legendary) | **`create_starter_pet` takes `dna` and `rarity` as client-supplied arguments** — anyone mints a max-rarity pet with hand-picked genes, free |

The Solana program is structurally ahead (PDAs, commit/settle, pause, checked
math). The EVM side needs an architectural refactor anyway, so v2 is the
moment to do it.

## 2. Upgradeability architecture

### 2.1 EVM — UUPS proxies, modular

Replace the constructor-deployed monolith with two UUPS proxies
(OpenZeppelin `@openzeppelin/contracts-upgradeable` ^5.x):

```
PetCoreProxy (UUPS)                 GameLogicProxy (UUPS)
├─ ERC721Upgradeable                ├─ battle v2 (stats, elements, XP)
├─ pet storage (Pet struct)         ├─ breeding v2 (generations, mutation)
├─ GameConfig struct + setters      └─ authorized caller of PetCore
├─ VRF consumer (breed + battle)
└─ PausableUpgradeable
```

- **Why UUPS, not Diamond**: two proxies cover the surface; Diamond's
  complexity isn't justified at this contract size and is harder to audit.
- **The combat sim lives outside the proxy**: since the sim is a pure
  function (§8.1), it deploys as its own stateless contract
  (`CombatSimV1`), address stored in GameConfig. This sidesteps the EIP-170
  24KB bytecode ceiling on GameLogic entirely, and turns balance patches
  into "deploy `CombatSimV2`, flip the address" — no proxy upgrade, and
  old sim versions stay on-chain for replaying historical battles.
- `Inventory`/`Utils` as separate deployed contracts go away: pet storage and
  config live in `PetCore`; pure helpers (DNA mixing, stat derivation) become
  internal libraries (no external-call gas, no authorization surface).
- Storage rules, enforced by `@openzeppelin/hardhat-upgrades` in CI:
  - `uint256[50] private __gap;` at the end of every storage-bearing base
  - append-only struct/storage changes; never reorder
  - `validateUpgrade` runs in the deploy script before any `upgradeProxy`
- `_authorizeUpgrade` → `onlyOwner`; owner is a Safe multisig from day one on
  testnet, and gains a **48h TimelockController** before any mainnet deploy.
- `Initializable` + `reinitializer(n)` for v2→v3 parameter migrations.

Migration note: current deployments are testnet-only — do **one breaking
redeploy** into proxies now rather than writing a state migrator for
throwaway data. After this redeploy, layout is frozen (gaps only).

### 2.2 Solana — keep the loader, version the accounts

The program is already upgradeable; the risk is account layout, not code.

- Add to every account: `version: u8` and real reserved space
  (`PetAccount`: 32 bytes, `GlobalState`/`PlayerProfile`: 64 bytes). Future
  fields consume reserved bytes without realloc; if reserved runs out, a
  `migrate_pet(version)` instruction with `realloc` (payer = owner) is the
  escape hatch.
- Move all tunables out of constants (`state.rs:5-6`) into `GlobalState` —
  they become admin-settable without a program upgrade (see §5).
- Upgrade authority → **Squads multisig** (2-of-3) before any mainnet talk;
  document `anchor verify` in the deploy script so builds are reproducible.
- Devnet accounts are disposable: ship the v2 layout as a breaking redeploy
  (new program id or wipe), same reasoning as EVM. Then freeze.

### 2.3 Solana — pets become Metaplex Core NFTs

Today a pet is a bare `PetAccount` PDA: no wallet shows it, no marketplace
can list it, and `transfer_pet.rs` hand-rolls transfer by closing the PDA
and re-creating it under the new owner's seeds. v2 adopts **Metaplex Core**
(`mpl-core`), not legacy Token Metadata:

- **Why Core over Token Metadata**: single account per asset instead of
  mint + token + metadata + master-edition (~0.0035 SOL rent vs ~0.022),
  first-class plugin system designed for gaming, and supported by Phantom,
  Solflare, Tensor, and Magic Eden. New projects have no reason to take on
  Token Metadata's account sprawl.
- **Structure**:
  - One Core **Collection** ("CryptoPets") created in `initialize`;
    collection/plugin authority = the `GlobalState` PDA.
  - `settle_mint` and `settle_breed` (§4.3) CPI into `mpl-core` to mint
    the asset into the collection, owner = player wallet.
  - The **Attributes plugin** carries display traits (element, species +
    skill, rarity, level, generation) so marketplaces render them. It is refreshed
    *lazily* — on level-up or via a permissionless `sync_metadata`
    instruction — never in the battle hot path.
- **Game state stays in the PDA**: `PetAccount` is re-seeded
  `[b"pet", asset_pubkey]` — stable across transfers, so battle/breed/train
  mutate only the cheap PDA with no Metaplex CPI per fight. Ownership checks
  deserialize the Core asset and require `asset.owner == signer` (replaces
  the `pet.owner` field as the source of truth).
- **Delete `transfer_pet` entirely**: transfers become standard Core
  transfers through any wallet. Indexer-go switches from watching the custom
  instruction to watching Core asset accounts (programSubscribe on
  `mpl-core` filtered by collection, or DAS API for backfill).
- Cost: `mpl-core` crate (anchor feature) as a new dependency; mint paths
  gain CPI compute but stay well under limits. Breaking redeploy — fine,
  devnet data is disposable (§2.2).

EVM needs no equivalent work: ERC-721 *is* the standard there; it just
exposes the same five attributes (§3.1) through `tokenURI` metadata.

## 3. Realistic battle (v2) — identical math on both chains

The flat 70% roll becomes stat-based combat derived deterministically from
DNA + level, so the same pet has the same strength on any server/reindex
(matches the determinism principle in `plan-agentic-pets.md` §1.4).

### 3.1 Canonical DNA → five attributes

Every pet has five attributes: **HP, Attack, Defense, Intelligence
(magic attack), Magic Defense** — mirroring OwO's split between physical
and magic resistance (PR/MR). A dedicated magic defense keeps Intelligence
from being overloaded: without it, INT would be magic attack *and* magic
resist *and* initiative *and* crits — strictly the best gene to roll (the
classic Gen-1 Pokémon "Special" imbalance).

Unify DNA to **16 decimal digits** on both chains (EVM already uses
`% 10^16`; max value 10^16−1 fits u64, so Solana's `u64 dna` is compatible).
Read digit pairs from least significant:

| Digit pair | Trait | Range |
| --- | --- | --- |
| 0–1 | element = pair % 6 | 0..5 (matches `persona.ts` `dna % 6` — see §11.2) |
| 2–3 | hpGene | 0..99 |
| 4–5 | atkGene | 0..99 |
| 6–7 | defGene | 0..99 |
| 8–9 | intGene | 0..99 |
| 10–11 | mdefGene | 0..99 |
| 12–15 | cosmetic (appearance, unused by combat) | — |

Effective stats (integer math only — must be bit-identical cross-chain):

```
HP   = 100 + 4*hpGene + 6*level     // hit-point pool
ATK  = 10 + atkGene  + 2*level      // physical damage dealt
DEF  = 10 + defGene  + 2*level      // physical mitigation
INT  = 10 + intGene  + 2*level      // magic damage + initiative + crits
MDEF = 10 + mdefGene + 2*level      // magic mitigation
```

Rarity multiplies **all five** stats: ×(100 + 5*(rarity−1)) / 100 (common
+0% … legendary +20%).

Each attribute has a distinct combat role, so no gene is a dump stat:

| Attribute | Role in battle |
| --- | --- |
| HP | durability — how many hits you survive |
| Attack | physical per-strike damage |
| Defense | reduces incoming physical damage |
| Intelligence | magic per-strike damage; strikes first (initiative) and crits more often |
| Magic Defense | reduces incoming magic damage |

### 3.2 Element wheel

Six elements in a cycle (0→1→2→3→4→5→0). Strikes against the next element
in the cycle deal ×115/100 damage; against the previous, ×85/100. Same wheel
feeds pet personas, so flavor and mechanics agree.

### 3.3 Battle resolution — round-based simulation (OwO-style)

Instead of one probability roll, the settle step runs a short deterministic
combat simulation driven by the five attributes and a single VRF output.
The model is OwO-bot-style turn combat — two damage types, mitigation,
crits — reduced to what is provable on-chain:

```
initiative: higher INT acts first each round (tie → attacker)

strike type (rolled per strike from the seed — deterministic):
            pMagicBps = 10000 * INT / (ATK + INT)     // casty pets cast more
            magic?    physical strike : magic strike

physical:   dmg = max(1, ATK * 100 / (100 + DEF))     // mitigated by armor
magic:      dmg = max(1, INT * 100 / (100 + MDEF))    // mitigated by magic defense
both:       dmg = dmg * elementMult / 100             // ×115 / ×100 / ×85
            crit = roll(critBps) → dmg * 150 / 100
            critBps = min(500 + 25*INT, 3000)         // 5% base, +0.25%/INT, cap 30%

victory:    first pet to reduce the other's HP pool to 0
round cap:  30 rounds; if both stand, higher remaining HP in bps of
            starting HP wins; exact tie → defender (discourages spam attacks)
```

This makes builds matter the way OwO matchups do: a high-DEF/low-MDEF tank
walls physical attackers but gets shredded by a caster; a spellward pet
(high MDEF) hard-counters casters but folds to brute force; a glass-cannon
caster loses the initiative race to a faster caster. Rarity multiplies all
five stats (§3.1), so it now directly affects combat — fixing the "rarity
is cosmetic" gap in the current contracts. Battles stay 1v1; weapons/items
stay out of scope (§10) until the inventory system exists.

- **Entropy**: the 32-byte VRF/Switchboard output seeds a per-round stream:
  `roundBytes = keccak256(vrfBytes ‖ roundIndex)`. keccak256 is native on
  both chains (EVM builtin, `solana_program::keccak`), so the simulation is
  bit-identical and replayable from the seed.
- **Cost**: worst case 30 keccaks + integer math — trivial Solana CU; on
  EVM the sim runs in the separate `settleBattle` tx (§3.5), ~10–20k gas.
- **Pacing sanity check**: two average level-10 pets (genes ≈ 50) have
  HP ≈ 360, ATK/DEF ≈ 80 → ~44 dmg per strike → fights end in ~8–10 rounds,
  well under the cap; max-level fights end in ~15.
- **Replayability**: `BattleResolved` emits the seed + summary (winner,
  rounds, remaining HP, crit count). The frontend re-runs the sim locally to
  animate the fight blow-by-blow, and the agentic-pets layer narrates it —
  no extra on-chain storage.
- Win odds are *emergent* from stats rather than clamped: a strictly better
  pet usually wins, but crit variance means upsets stay possible.
  Indexer-go reimplements the sim in Go (§7) and shows a pre-fight win
  estimate by sampling seeds. Replaces `ATTACK_VICTORY_PROBABILITY` on both
  chains.

### 3.4 XP replaces level-per-win

- XP is credited **inside battle settlement** (same transaction — no extra
  fee, no separate `levelUp` call): winner +100 XP, loser +25 XP (losing
  still progresses — keeps engagement). Level-ups apply automatically when
  the threshold is crossed.
- **XP scales with level difference** (anti seal-clubbing — without this,
  the optimal strategy is a high-level pet farming newbies forever):
  `xpMult = clamp(100 + 10·(opponentLevel − myLevel), 0, 200)` percent,
  applied to both win and loss XP. Punching +10 levels up pays double;
  fighting −10 or below pays **zero**. Integer math, part of the golden
  vectors (§7).
- **Challenge level band**: a battle commit/request is rejected outright if
  the two pets are more than `levelBandWidth` (±10, config §5) levels
  apart. The band protects low-level pets from cooldown griefing; the XP
  multiplier kills farming *inside* the band.
- **No same-owner battles**: a battle where both pets share an owner is
  rejected (one cheap check per chain) — it's the most trivial XP farm and
  has no legitimate use.
- **Same-opponent decay** (anti win-trading between sybil wallets): each
  pet stores `lastOpponentId` + `sameOpponentStreak` (two small fields,
  fits reserved space). Consecutive battles against the same opponent
  halve the XP each time (100 → 50 → 25 → 12…); fighting anyone else
  resets the streak. Honest limitation: a farmer with 3+ pets across
  wallets rotates opponents and never decays — decay raises the *effort*,
  but the real backstops are the 15-min cooldown (throughput cap) and the
  zero-XP rule below the level band.
- XP to advance from level L: `100 * L`, so each level is harder than the
  last. Cumulative ≈ 50·L²:

| Milestone | XP needed (cumulative) | Wins required (minimum) | Realistic wall-clock |
| --- | --- | --- | --- |
| level 10 | ~4,500 | ~45 | a few days |
| level 50 | ~122,500 | ~1,225 | months |
| level 100 (cap) | ~495,000 | ~4,950 | **6–12+ months** — even battling nonstop at the 15-min cooldown (≤96 fights/day) and never losing, the floor is ~52 days |

  Level 100 is deliberately a prestige achievement, not a grind target.
- **Network fees do NOT scale with level** — and shouldn't. The round cap
  bounds the sim, so a level-100 fight costs the same gas as a level-1
  fight. What *should* scale is the in-game fee sink: the **train fee
  scales with level**, `trainFee(L) = baseFee × (100 + 2·L) / 100` (1× at
  level 1 → 3× at level 100), while train still grants a flat +100 XP. So
  paid progress gets doubly expensive at high level: the fee rises *and*
  100 XP is a shrinking fraction of the `100·L` requirement. Battling is
  always the efficient path; training is a convenience sink.
- Train remains capped at once per pet per 24h. Removes the pay-to-win
  infinite-level hole while keeping the fee sink.

### 3.5 Battle flow & randomness

- **Solana**: keep commit→settle (already correct). Add a
  `cancel_battle` instruction: if the Switchboard randomness expires
  unrevealed, the attacker (or anyone after a grace window of ~150 slots
  ≈ 1 min) closes the stuck `BattleRequest` — today an expired reveal locks
  the attacker out forever, since the request PDA is seeded per-attacker.
- **Solana consent**: commit currently drags the defender's pet in without a
  signature (cooldown griefing). v2: defender consents either by co-signing
  or via the challenge/accept flow from `plan-agentic-pets.md` §6 — the
  accept transaction *is* the consent. Interim cheap fix: a per-pet
  `open_to_challenges: bool` flag (default true) toggleable by the owner.
- **EVM — three steps, not two**: `requestBattle` (VRF request) →
  `fulfillRandomWords` **only stores the random word** → `settleBattle
  (requestId)` (callable by anyone) runs the sim and writes results. This
  is Chainlink's own best practice: if game logic ran inside the callback
  and ever reverted (bug, gas spike, config change), the randomness would
  be burned and the battle stuck forever. Store-then-settle means a failed
  settle is just retryable, and the shape now matches Solana's
  commit→settle exactly — same states for indexer-go on both chains. Kills
  the `randMod` manipulation. VRF params: callback gas **150,000**
  (store-only), 3 confirmations, 1 word, same subscription as breeding.
  Apply the same pattern to breeding's `fulfillRandomWords` (today it mints
  inside the callback). On an L2 (Base/Arbitrum Sepolia → mainnet)
  per-request cost is cents; on L1 mainnet it would be several dollars per
  battle — **plan for L2 as the EVM home**.
- `msg.sender` must own the attacking pet (fixes the missing auth in
  `Battle.sol`), and defender consent mirrors Solana (challenge/accept).

### 3.6 Fee budget — what a battle actually costs

The OwO-style sim does **not** meaningfully raise fees. Per-strike work is
a few hundred gas of integer math; each round consumes one keccak (~36 gas)
whose 32 bytes cover all of that round's rolls (strike types, crits — the
magic/physical split costs zero extra hashing). A full 30-round fight is
roughly 10–20k gas of compute — a rounding error next to everything else
in the transaction.

Realistic per-battle cost breakdown, biggest first:

| Cost component | EVM (Base/L2) | Solana |
| --- | --- | --- |
| Randomness service | **dominant**: Chainlink VRF premium + gas reimbursement per request — order $0.05–0.30 (see §11.2) | Switchboard On-Demand commit+reveal — fractions of a cent |
| Storage writes (XP, W/L, level, cooldowns) | ~20–40k gas | included in tx; accounts already rent-paid |
| Event logs | ~2–5k gas | negligible |
| **Combat sim (the OwO part)** | **~10–20k gas ≈ <$0.01** | ~50–100k CU, well inside the 1.4M ceiling — effectively free |
| Whole settle tx | ~120–180k gas ≈ cents on Base | ~2 txs × 5k lamports base fee ≈ **$0.001–0.01 total** |

Implications:

- On Solana, fees are per-signature, not per-compute — battle complexity is
  essentially free until the CU ceiling. OwO logic, elements, crits: all fine.
- On EVM, the one real cost center is the **VRF request, which is flat per
  battle regardless of logic complexity** — making the sim richer doesn't
  move it. If that flat cost ever matters, the levers are: a cheaper entropy
  provider (e.g. Pyth Entropy), one VRF word shared across a settlement
  batch, or the §8 paths.

### 3.7 Species tiers & passive skills (OwO-style)

Like OwO's hunt pools, the **species roster is partitioned by rarity
tier**: rabbits and dogs live in the common pool, lions and eagles in the
rare pool, dragons and phoenixes in the legendary pool. A rabbit is
*always* common; a dragon is *always* legendary. Rarity already rolls from
DNA at mint (50/25/15/8/2, `Utils.calculateRarity`), so species hangs off
it:

```
tier    = rarity (1..5, rolled from DNA at mint — unchanged)
species = (tier, digitPair(12,13) % poolSize[tier])   // stored at mint
skill   = species.index % 8           // derived — the 8 archetypes below
```

- **Species is resolved once at mint/settle and stored on the pet** as a
  `(tier, index)` pair (`species: u16` — consumes 2 reserved bytes on
  Solana, one slot-packed field on EVM). It must NOT be derived live:
  pools are append-only, and growing a pool would change `% poolSize` and
  silently re-species every existing pet.
- **On-chain config is just counts, not lists**: the chain only needs
  `poolSize[tier]` — five u16s (10 bytes) in `GameConfig`/`GlobalState`.
  The index → animal-name/art mapping is pure display and lives in the
  off-chain metadata API / Attributes plugin the plan already requires.
  Adding new animals = increment one counter + publish art — no contract
  upgrade, no account resizing. This is how the roster grows toward OwO's
  "hundreds" without hundreds of day-one drawings *or* on-chain storage
  concerns.
- **Skill derives, doesn't store**: the launch grid is one species per
  archetype per tier, so `skill = index % 8` — zero storage. If curated
  per-species skills are wanted later, an override map costs one byte per
  species (1,000 species = 1KB — fits a small dedicated PDA / one mapping
  comfortably).
- **Stat consequence for free**: the §3.1 rarity multiplier (+5%/tier)
  already makes a lion strictly outclass an equal-gene rabbit. Species
  adds *flavor and a skill*, not another stat axis.
- **Images are an off-chain problem — art does not block contract work.**
  The contract stores only `speciesId`; the EVM `tokenURI` API and the
  Metaplex Attributes plugin (§2.3) map id → name + image (IPFS/CDN).
  Launch can use placeholder art per tier and upgrade images later without
  touching the chain.

Each species maps to one of **8 passive skill archetypes** — deterministic
modifiers hooked into the §3.3 sim, no player input, negligible gas
(§3.6). With hundreds of species, per-species unique skills are
unbalanceable; archetypes keep the matrix testable. Suggested launch grid:
**5 tiers × 8 species = 40 species**, one species per archetype per tier,
so every archetype is reachable at every rarity:

| Archetype (example species) | Skill | Sim hook |
| --- | --- | --- |
| **Tank** (Elephant) | +20% HP pool | pre-battle stat modifier |
| **Shell** (Turtle) | +25% DEF, always strikes second | stat modifier + initiative override |
| **Swift** (Rabbit) | wins all initiative ties, +5% crit | initiative + crit modifier |
| **Cunning** (Fox) | crit cap raised 30%→40% | crit modifier |
| **Fury** (Dragon) | +30% damage while own HP < 30% | per-strike conditional |
| **Sage** (Owl) | +25% MDEF, magic strikes ignore element penalty | stat + element modifier |
| **Rebirth** (Phoenix) | once per battle, survive a killing blow at 1 HP | one-time trigger flag |
| **Bloodlust** (Wolf) | heals 15% of physical damage dealt | per-strike lifesteal |

Rules that keep this sane:

- **Passives only in v2.** Active/clickable abilities need per-turn player
  input — a different transaction model. Not now.
- All hooks are integer modifiers at three well-defined points: pre-battle
  stats, per-strike damage, and one-time flags. No new entropy, no loops —
  the sim stays bit-identical cross-chain and replayable from the seed.
- Skill *values* (the +20%, the caps) live in `GameConfig`/`GlobalState`
  like every other tunable (§5), so balance patches don't need a program
  upgrade. Skill *assignment* derives from the index (`% 8`) — no map to
  store or maintain.
- Golden vectors (§7) gain at least one case per archetype, plus
  archetype-vs-archetype edge cases (Rebirth vs Rebirth, Rebirth on round
  cap).
- Breeding: the child rolls rarity first (§4.2, including the rarity
  bump), then species from *that tier's* pool using its inherited cosmetic
  digits. Within a tier, species leans toward the parents (cosmetic digits
  inherit 45/45/10); across tiers it can't — a rarity-bumped child leaves
  the rabbit pool behind. Mutation can still surprise you with a different
  animal in the same tier.
- Display: species + skill join element/rarity/level in the Metaplex
  Attributes plugin and EVM `tokenURI` metadata.

## 4. Realistic breeding (v2)

### 4.1 Rules

- Caller must own **both** parents (fixes missing EVM check) — or the pets
  are married and the caller owns one of them (cross-owner path, §4.4).
- Track lineage: `parent1Id`, `parent2Id`, `generation`, `breedCount` on the
  pet. `generation(child) = max(gen p1, gen p2) + 1`.
- Incest guard: a pet cannot breed with its own parent or child (one level of
  lineage check — cheap, stored on-chain; full ancestry trees are not worth
  the storage).
- Both parents enter a **breeding cooldown keyed on each parent's own
  `breedCount`** — the CryptoKitties curve. Keying on the child's
  generation (an earlier draft of this plan) is a population bug: two
  gen-1 pets would sit at the cheapest cooldown forever and produce ~24
  pets/day indefinitely. Per-parent escalation is what actually throttles
  supply:

| Parent's breedCount (before this breed) | That parent's cooldown |
| --- | --- |
| 0 | 1 h |
| 1 | 2 h |
| 2 | 4 h |
| n | min(2ⁿ h, 168 h) — doubles, capped at 7 days |

  Each parent uses its *own* count, so a fresh pet paired with a veteran
  takes a short cooldown while the veteran takes the long one.
- Breeding also requires a separate **`breedReadyAt`** field — battle,
  breed, and newborn cooldowns have different durations and must not share
  the single `readyTime` field the current contracts use (a battle would
  otherwise reset a 7-day breed cooldown to 15 minutes).
- Generation cap **20** (prevents stat-farming infinite dynasties; gen >
  cap → breed rejected). Minted pets (§4.3) are **generation 0**.

### 4.2 Gene mixing with mutation

Per digit pair (8 pairs), using successive bytes of the VRF output:

- 45%: inherit parent 1's pair
- 45%: inherit parent 2's pair
- 10%: **mutation** — fresh random pair from the VRF bytes

Rarity: recompute from child DNA as today (`Utils.calculateRarity` 50/25/15/
8/2 split is fine), plus a **5% rarity bump** (+1, max 5) when both parents
are rarity ≥ 4 — makes high-rarity breeding pairs meaningful.

Newborn stats: level 1, 0 XP, generation as above. Newborns get a
**12h newborn cooldown** before first battle.

### 4.3 Minting & fees — no free pets

**The free starter is removed entirely.** It was the worst hole in the
current contracts in two ways: Solana's `create_starter_pet` takes `dna`
and `rarity` as *client-supplied arguments* (anyone mints a hand-crafted
legendary, free), and EVM's `createRandom` derives DNA from grindable
entropy (mine names until legendary). Free + manipulable = the rarity
economy is dead on arrival. v2 has exactly two ways to obtain a pet:

**1. Paid gacha mint (replaces the starter):**

- Flow mirrors breeding: `requestMintPet` (EVM, VRF) / `commit_mint` →
  `settle_mint` (Solana, Switchboard). DNA comes **only** from the
  randomness output — no client-supplied `dna`/`rarity`, no name-derived
  entropy. Rarity rolls the standard 50/25/15/8/2; rarer pets come from
  minting more (gacha) or breeding up.
- **The mint fee escalates per wallet**:
  `mintFee(n) = baseMintFee × 2^min(n, 7)` where `n` = pets this wallet
  has already minted (`mintCount[addr]` / `mint_count` on PlayerProfile —
  replaces `starterMinted`/`starter_created`). First mint is cheap (the
  de-facto starter), the 8th and beyond cost 128× base. Chasing legendaries
  by re-rolling gets expensive fast, which is the point.
- Honest limitation: per-wallet escalation is a progressive tax, not a
  sybil proof — a determined farmer rotates fresh wallets and pays base
  fee each time. So **baseMintFee is the real price floor** per pet; set
  it high enough that base × expected-rolls-to-legendary (~50 mints at 2%)
  is meaningful money, and let escalation punish the lazy path.
- Minted pets: generation 0, level 1, ready immediately (they're paid
  for — the newborn cooldown below applies only to bred pets).

**2. Breeding** (§4.1–§4.2, §4.4), with its own fees:

- EVM: breed fee `0.0005 ETH` (≈ a couple of dollars on L2) sent with
  `requestCreateFromDNA`, withdrawable by owner (already exists).
- Solana: breed fee `0.01 SOL` transferred to a fee-vault PDA; add a
  `withdraw_fees` admin instruction.
- Bred newborns keep the **12h newborn cooldown** (§4.2).

Fee-exit rule: every user-withdrawal path (`withdrawStudFees`, future
reward claims) must remain callable **while paused** — pause gates
gameplay, never users' funds.

### 4.4 Marriage system — consent-gated cross-owner breeding

§4.1's "caller must own both parents" check (a v2 fix — today's contracts
have **no** ownership check at all) blocks cross-owner breeding entirely,
leaving stud-style breeding explicitly out of scope. v2 closes that gap with
a CryptoKitties-proven **stud-fee model**, gated by mutual on-chain consent:

- **Same-owner breeding is unchanged** (§4.1): no marriage needed, no stud
  fee — paying yourself is pointless.
- **Cross-owner breeding requires an active marriage** between the two
  pets — a mutual bond established via `proposeMarriage` /
  `acceptMarriage`. Marriage is the *only* path to cross-owner breeding;
  there is no open stud market, so no spam/listing surface to grief.
- **Stud fee on breed**: whichever owner *calls* breed
  (`requestCreateFromDNA` / `commit_breed`) pays a flat `studFee` (new
  global parameter, §5) to the *other* pet's current owner and receives the
  child — exactly CryptoKitties' "siring" model. The other owner keeps
  their pet and earns the fee. **Both parents still take the normal breed
  cooldown** (§4.1 generation table) regardless of who initiated.
- All §4.1/§4.2 rules still apply to married pairs unchanged: incest guard,
  generation cap, gene mixing, rarity bump. Marriage only changes *who* may
  call breed on a cross-owner pair and *where the fee/child go*.

#### On-chain state

| Chain | Representation |
| --- | --- |
| EVM | `mapping(uint256 => MarriageRecord) public marriageOf;` where `MarriageRecord { uint256 spouseId; address ownerSnapshot; }` — written for both pets at accept time (mutual), `ownerSnapshot` = that pet's owner when consent was given; plus `mapping(uint256 => uint256) public marriageProposal;` for pending proposals |
| Solana | `Marriage` PDA seeded `[b"marriage", min(petIdA,petIdB), max(petIdA,petIdB)]`, holding `pet_a_id, pet_b_id, owner_a, owner_b, since, bump` — owners snapshotted at accept time |

#### New instructions / functions

- `proposeMarriage(petIdA, petIdB)` — caller owns `petIdA`; both pets must
  have different owners (same-owner pairs don't need marriage); `petIdA`
  has no active marriage or live proposal; incest guard applies (cannot
  propose to a parent/child, §4.1). The proposal stores **the proposer's
  address and an expiry** (`proposalTTL`, §5, suggest 7 days).
- `acceptMarriage(petIdA, petIdB)` — caller owns `petIdB`, a matching
  unexpired proposal exists, **and the stored proposer still owns
  `petIdA`** — without this check, propose-then-sell marries the buyer's
  pet without their consent. Creates the mutual bond, snapshotting both
  current owners.
- `cancelProposal(petIdA)` — proposer withdraws a pending proposal at any
  time; expired proposals are also simply overwritable by a new
  `proposeMarriage`. Without cancel/expiry, one mis-click would lock a pet
  out of marriage forever (proposals block new proposals).
- `divorce(petId)` — either owner dissolves immediately. A
  **`marriageCooldown`** (new parameter, §5, suggest 24h) applies before
  either pet can enter a new marriage — prevents propose/divorce spam.

#### Breed flow change (cross-owner branch only)

`requestCreateFromDNA` (EVM) / `commit_breed` (Solana) gain a cross-owner
branch: if the two pets have different owners, require a **valid** marriage
for the pair (mutual records + owner snapshots still matching current
owners — see below); require the caller owns one of the two pets; collect
`studFee` for the *other* pet's owner. The child mints to the caller,
exactly as the existing same-owner path already does.

**Stud fee is collected at settle, not commit/request.** Both chains'
breeding is two-step with a cancel path for expired randomness
(`cancel_breed`, §6); if the fee moved at commit, a cancelled breed would
need a refund flow. Charging the initiator at commit into escrow and
releasing at settle (refunding on cancel) keeps it one rule: **no breed,
no stud fee**.

**Stud fee is a pull payment on EVM**: settle credits
`pendingStudFees[otherOwner]` and the owner withdraws via
`withdrawStudFees()`. Never push ETH mid-settle — a recipient contract
that reverts on receive would otherwise make breeding with their pet
permanently impossible. On Solana, push at settle is fine: a lamport
transfer to a system account cannot be made to fail by the recipient.

#### Edge case: transfers invalidate marriages (lazily)

Marriage is consent between *current* owners — but hooking every transfer
(EVM `_update`, Core transfer) to dissolve marriages costs gas on every
transfer and adds code on both chains. Instead, invalidate **lazily**: the
marriage records snapshot both owners at accept time, and the breed-time
check requires snapshots to still match the pets' current owners. A
transfer silently makes the marriage stale — same security guarantee (the
new owner never consented), zero per-transfer cost. A permissionless
`clearStaleMarriage(petIdA, petIdB)` cleans up stale records (and on
Solana reclaims the PDA rent); stale dissolution skips the
`marriageCooldown` penalty.

#### Sequencing note (Solana)

Pre-§2.3, Solana `PetAccount` PDAs are seeded
`[PetAccount::SEED, owner_pubkey, id]` — owner-scoped, which is why
`transfer_pet` has to close-and-recreate the PDA. A cross-owner `Marriage`
PDA is far simpler once §2.3's owner-independent `[b"pet", asset_pubkey]`
seeding lands. **Schedule Marriage after the Metaplex Core phase (§9.2
Phase A)** on Solana; EVM has no such dependency (pet IDs are already
owner-independent ERC-721 token IDs).

#### Events

`MarriageProposed{petIdA, petIdB}`, `MarriageAccepted{petIdA, petIdB}`,
`MarriageDissolved{petIdA, petIdB, reason}` (`reason`: divorce | stale).
`Bred`/`BredEvent` gain `studFeePaidTo` (zero for same-owner breeds).

## 5. Parameter table (single source of truth)

All of these live in `GameConfig` (EVM, in PetCore storage) /
`GlobalState` (Solana) with admin setters + events — tunable without
upgrades. Constants in code today (`BATTLE_COOLDOWN`, `LEVEL_UP_FEE`,
`ATTACK_VICTORY_PROBABILITY`) all migrate here.

| Parameter | Dev/devnet | Production target |
| --- | --- | --- |
| battleCooldown | 5 s (keep for testing) | **900 s (15 min)** |
| trainCooldown | 60 s | **86,400 s (24 h)** |
| trainFee (base) | 0.001 ETH / 0.01 SOL | 0.001 ETH / 0.01 SOL |
| trainFee level scaling | ×(100 + 2·L)/100 — 1× at L1 → 3× at L100 | same |
| trainXp | 100 (flat — naturally devalues as `100·L` requirement grows) | 100 |
| baseMintFee (§4.3) | 0.0001 ETH / 0.005 SOL | **0.0005 ETH / 0.02 SOL** |
| mintFee escalation (§4.3) | off (×1 flat) | ×2 per wallet mint, cap ×128 |
| breedFee | 0 | **0.0005 ETH / 0.01 SOL** |
| studFee (§4.4) | 0 | **0.001 ETH / 0.02 SOL** |
| marriageCooldown (§4.4) | 60 s | 86,400 s (24 h) |
| proposalTTL (§4.4) | 1 h | 7 days |
| breedCooldown (by parent breedCount) | 60 s flat | 2ⁿ h, cap 168 h (§4.1) |
| newbornCooldown | 60 s | 43,200 s (12 h) |
| winXp / lossXp | 100 / 25 | 100 / 25 |
| xpLevelDiffMult (§3.4) | clamp(100 + 10·Δ, 0, 200)% | same |
| levelBandWidth (§3.4) | ±100 (off, for testing) | **±10** |
| sameOpponentDecay (§3.4) | off | halve XP per consecutive repeat |
| xpToNextLevel(L) | 100·L | 100·L |
| maxLevel | 100 | 100 |
| critBaseBps / critPerInt | 500 / 25 (cap 3000) | 500 / 25 (cap 3000) |
| critDamage | 150% | 150% |
| maxRounds | 30 (tie → defender) | 30 (tie → defender) |
| elementBonus | ±15% | ±15% |
| mutationChance | 10% | 10% |
| rarityBumpChance | 5% | 5% |
| generationCap | 20 | 20 |
| poolSize per tier (§3.7) | 8 (1 tier) | 8 per tier × 5 tiers at launch, append-only counters |
| VRF callbackGasLimit | 500k | **150k** (callback stores the word only; settle is a separate retryable tx — §3.5) |
| Switchboard reveal grace before cancel | 150 slots | 150 slots (~1 min) |
| Proxy upgrade delay (timelock) | none | **48 h** (mainnet) |

Setter hygiene: every setter emits a `ConfigChanged` event (indexer-go can
mirror config), and bounds-checks (e.g. cooldowns ≤ 7 days, fees ≤ 0.1
ETH/1 SOL) so a fat-fingered admin can't brick the game.

## 6. Security fixes bundled into v2 (blockers for "almost complete")

EVM:
1. Ownership check on battle initiation (`Battle.fight/attack` have none).
2. Replace `Utils.randMod` with VRF request → store → settle for battles
   (§3.5), and move breeding's mint out of the VRF callback the same way.
3. **Delete `changeDna`** — it is a stat/rarity cheat. If cosmetic rerolls
   are wanted later, do a VRF-based `rerollCosmetic` touching digits 10–15 only.
4. `fulfillRandomWords` uses `_safeMint` → a malicious/buggy receiver
   contract can revert the VRF callback and burn the request. Use `_mint`.
5. `withdraw` uses `transfer` (2300 gas stipend breaks Safe owners) → use
   `call{value: ...}` + check.
6. Add `PausableUpgradeable` (parity with Solana) — pause gates battle,
   breed, train, transfer-adjacent mints.
7. Drop `ownerPetCount` (duplicates `balanceOf`, and the starter check built
   on it is wrong); `mintCount[addr]` (§4.3) replaces it for fee escalation.
8. Bound name length (≤ 32 bytes, parity with Solana's `MAX_NAME_LEN`).
9. **Delete `createRandom`** — grindable DNA entropy (§4.3); replaced by
   the VRF gacha mint. Until Phase 3 lands, an interim Phase-0 clamp:
   starter rarity forced to 1 regardless of rolled DNA.

Solana:
1. **`create_starter_pet` must stop accepting `dna`/`rarity` from the
   client** — it is a free arbitrary-legendary mint (§1, §4.3). Replaced
   by `commit_mint`/`settle_mint`; interim Phase-0 clamp: derive dna
   on-chain (slothash + payer) and force rarity 1.
2. `cancel_battle` / `cancel_breed` for expired randomness (§3.5) — today an
   unrevealed commit permanently locks the attacker's request PDA.
3. Defender consent on `commit_battle` (§3.5).
4. XP/level cap (settle currently increments `level: u16` per win, forever).
5. Fee vault PDA + `withdraw_fees` — route all fees, including the existing
   `level_up_fee_lamports`, into one vault (see §11.2).
6. Drop `PlayerProfile.pet_count` — once §2.3 makes transfers standard Core
   transfers, the program never sees them and the count silently rots
   (same reasoning as EVM's `ownerPetCount`). `mint_count` (§4.3) is the
   field that matters and only mint touches it.
7. Split `ready_time` into separate battle/breed cooldown fields (§4.1).

Tooling gate before tagging v2: `slither` clean (or triaged) on EVM,
`cargo clippy -D warnings` + Anchor `idl build` diff check on Solana, and
the OZ upgrades plugin layout validation in CI.

## 7. Cross-chain parity testing (the part that usually rots)

Battle/breed math must be **identical** on both chains. Enforce it with
shared golden vectors, not discipline:

- `contracts/test-vectors/battle.json`, `breed.json`: arrays of
  `{dna1, dna2, level1, level2, rarity1, rarity2, vrfBytes,
  expected{winner, rounds, hp1RemainingBps, hp2RemainingBps, critCount}}`
  and `{…, expected{childDna, childRarity, childGeneration}}`
  (~200 cases incl. element wheel wrap, crit cap, round-cap ties, mutation
  boundaries, max level, generation cap).
- Hardhat tests, Anchor tests (`tests/`), **and** indexer-go unit tests all
  consume the same files. Indexer-go gets the stat-derivation function in Go
  so the UI can show pWin pre-battle without an RPC simulation.
- `marriage.json` (§4.4): propose/accept/divorce happy paths, incest-guard
  rejections, cross-owner breed with stud-fee payout, and the
  stale-marriage (owner changed since accept) edge case.
- `battle.json` gains XP cases: level-diff multiplier boundaries (Δ = ±10,
  0), level-band rejections, and same-opponent decay sequences (§3.4).

## 8. Scaling path: off-chain compute, on-chain verification

More gaming logic on-chain = growing fees. The answer is **yes, computation
can move off-chain and be verified on-chain** — but at today's logic size it
would be premature. What matters *now* is keeping the door open.

### 8.1 The enabling rule (costs nothing today)

Every gameplay outcome must remain a **pure function of
(committed on-chain state, VRF seed)** — no clock reads inside game math, no
admin inputs, no off-chain data. The v2 combat sim already satisfies this
(§3.3). Make it a hard rule for every future mechanic. Then *where* the
computation runs becomes a deployment decision, not a redesign: the same
function can execute in the contract, in indexer-go, in a zk prover, or in
the browser — and the chain only needs to check the answer.

### 8.2 Verification options, honestly compared

| # | Approach | Per-action on-chain cost | Trust model | Fits |
| --- | --- | --- | --- | --- |
| 1 | Fully on-chain (v2) | ~50–100k gas in the settle tx ≈ **fractions of a cent on an L2**; Solana compute is nearly free (fees are per-signature) | trustless | current sim — no proof system beats this today |
| 2 | Optimistic settlement | ~20–30k gas: store `(seed, resultHash)`; challenge window re-runs the sim on-chain as fraud arbiter, challenger bonds | trustless after window (e.g. 1h) | first step once per-action logic outgrows the callback |
| 3 | zk-proven batches (SP1 / RISC Zero zkVM) | one Groth16 verify ≈ 270–300k gas (EVM) / ~200k CU via alt_bn128 syscalls (Solana), **amortized: 100 battles/proof → ~3k gas each** | trustless, proving latency seconds–minutes (settle is already async) | tournaments, daily ticks, mass PvE simulation |
| 4 | State channels | two signatures + one final settle per *session* | trustless with replay-on-dispute | best-of-N PvP sessions between two players |
| 5 | MagicBlock ephemeral rollups (Solana) | delegate `PetAccount` PDAs into a session rollup — moves are free/instant, state commits back to mainnet after | inherits rollup security; Anchor-compatible (see §11.2) | real-time play sessions on Solana |
| — | Trusted server signs results | ~5k gas (ecrecover / ed25519-program) | **server can lie — this is web2 with extra steps** | only as interim, and only with option 2's challenge game on top |

### 8.3 Recommended sequence

- **v2 (now)**: stay fully on-chain. The deterministic-seed sim *is* the fee
  optimization — and picking an L2 as the EVM home (§11) does more for fees
  than any proof system at this scale.
- **Trigger for v3**: a mechanic exceeding ~300k gas per action, or action
  *frequency* outgrowing per-action pricing (daily agent ticks for thousands
  of pets, tournament brackets). Then: **option 2 first** (no new
  cryptography, ships fast), **option 3** when volume justifies a prover
  pipeline.
- **The cross-chain bonus**: the Solana sim is already Rust, and SP1/RISC
  Zero consume Rust directly. Factor the combat/breed math into a
  `no_std`-friendly crate and the *same code* that runs on Solana becomes
  the zk-proven program verified on EVM — stronger than golden-vector parity
  (§7), because there is only one implementation left to trust. The golden
  vectors then double as the prover's test suite.
- **Design debt to avoid now**: keep game math in pure library functions
  (already the plan), keep the sim implementable on-chain forever (it is the
  fraud arbiter for option 2), and never let a mechanic read
  `block.timestamp`/`Clock` *inside* the math — pass time in as a committed
  input.

## 9. Phases & realistic timeline — split into v2-core and v2.1

The plan accumulated features; shipping it as one release would be a
mistake. **v2-core** is the load-bearing foundation (security fixes,
upgradeability, the new game math). **v2.1** is purely additive — Metaplex
Core, species tiers, marriage — and lands on top without touching core
math, because Phase 1's reserved bytes and config patterns leave room.

### 9.1 v2-core (ship first)

| Phase | Work | Est. |
| --- | --- | --- |
| **0 — Hotfixes** | EVM auth checks, `_mint`, delete `changeDna`, name bounds; **starter clamps on both chains (§6)**; Solana cancel instructions. No layout changes. | 1–2 days |
| **1 — Upgradeable skeletons** | EVM: UUPS refactor (PetCore + GameLogic), GameConfig, Pausable; deploy scripts with `validateUpgrade`. Solana: account `version` + reserved space, config into GlobalState, fee vault. Breaking redeploy on testnet/devnet. | 3–5 days |
| **2 — Battle v2** | DNA→5-attribute lib (HP/ATK/DEF/INT/MDEF), element wheel, round-based combat sim, XP/leveling with level-diff scaling + band + same-owner ban + same-opponent decay, EVM request→store→settle battles, Solana settle sim, golden vectors, events (`BattleResolved{ids, seed, winner, rounds, hpRemaining, xp...}`). | 4–6 days |
| **3 — Breeding & mint v2** | Generations, lineage, breedCount cooldown curve, separate cooldown fields, mutation mixing, fees, rarity bump; **gacha mint with per-wallet fee escalation replaces the free starter (§4.3)** — shares the request/commit→settle infra with breeding. | 4–5 days |
| **4 — Ops hardening** | Safe/Squads multisig as owner/upgrade-authority, timelock wiring (dormant until mainnet), pause drill, `anchor verify`, slither/clippy CI gates. | 2–3 days |
| **5 — Downstream (core)** | Subgraph schema + startBlock bump, indexer-go: new event decoding, Go combat-sim lib (pre-fight win estimates + fight replay data); backend repositories, frontend fight animation from the seed. | 4–6 days |

v2-core total ≈ **4–5 working weeks**. Phases 2 and 3 each end with a
devnet/testnet redeploy plus a full indexer reindex (the project has done
startBlock bumps before — `bb8ea89`).

### 9.2 v2.1 (additive, after core is stable on devnet/testnet)

| Phase | Work | Est. |
| --- | --- | --- |
| **A — Metaplex Core (§2.3)** | Collection at initialize, mint CPIs in mint/breed paths, `PetAccount` re-seed to `[b"pet", asset]`, Attributes plugin + `sync_metadata`, delete `transfer_pet`, drop `pet_count`; indexer-go Core asset transfer tracking. | 4–5 days |
| **B — Species tiers & skills (§3.7)** | `poolSize` counters in config, species resolved + stored at mint as (tier, index), 8 passive skill archetypes hooked in the sim (`index % 8`), golden vectors per archetype, Attributes/metadata exposure. | 2–3 days |
| **C — Marriage system (§4.4)** | Marriage records/PDA with owner snapshots, propose/accept/cancel/divorce with proposal TTL, cross-owner breed branch with settle-time pull-payment stud fees, stale-marriage cleanup, golden vectors. On Solana, depends on Phase A. | 3–4 days |

v2.1 total ≈ **1.5–2 working weeks**. Order within v2.1 is flexible except
C-after-A on Solana.

## 10. Explicitly out of scope (v2)

- Open stud marketplace / per-marriage negotiable fees — §4.4 covers
  cross-owner breeding via mutual marriage with one global `studFee`, not a
  listing/marketplace
- ERC-721 ↔ Solana bridging or any cross-chain pet identity on-chain
- Items/Inventory gameplay (potions, equipment, OwO-style weapons) — config
  leaves room
- Team battles (anything beyond 1v1)
- Tokenomics beyond fee sinks (no ERC-20/SPL token)
- Formal third-party audit (do it once mainnet is actually scheduled; this
  plan's CI gates are the pre-audit bar)

## 11. Open decisions & pre-flight checks

### 11.1 Decisions needed

1. **EVM home chain**: VRF-per-battle is only economical on an L2. Base
   Sepolia → Base is the default assumption; confirm before Phase 2.
2. **Defender consent UX**: co-sign vs challenge/accept vs `open_to_challenges`
   flag (§3.5). Challenge/accept dovetails with the agentic-pets proposal
   flow — recommended, but it sequences Phase 2 after that backend work or
   ships the flag as interim.
3. **Train fee destination**: pure sink (burn/treasury) or future reward pool?
   Treasury for now; revisit with tokenomics.
4. **Species roster & art pipeline** (§3.7): which 40 animals fill the
   launch grid (5 tiers × 8 archetypes), and where the art comes from
   (commissioned set vs AI-generated with manual curation). Art does not
   block contract work — `speciesId → image` lives behind the metadata
   API — but the roster names should be locked before the §2.3 Attributes
   plugin and `tokenURI` ship.

### 11.2 Verify against current code/services before kicking off

5. **Element derivation** (§3.1): confirm `persona.ts`'s `dna % 6` matches
   the plan's `pair % 6` exactly before Phase 2.
6. **Species derivation** (§3.7): confirm how the frontend currently
   derives appearance/species from DNA, and migrate it to read the stored
   `speciesId` (tier-pool model) instead of deriving its own.
7. **Fee routing** (§4.3, §6): confirm where Solana's
   `level_up_fee_lamports` currently lands before consolidating fees into
   the v2 fee vault.
8. **VRF pricing** (§3.6): confirm current Chainlink VRF cost on Base before
   Phase 2 — plan assumes $0.05–0.30/request.
9. **MagicBlock maturity** (§8.2, option 5): re-check ephemeral-rollup
   support before considering it for v3+; not needed for v2.
10. **Balance Monte Carlo** (§3): before locking the §5 combat parameters,
   run ~10k simulated battles over random DNA/level matchups (the sim is a
   pure function, so this is a day of TS/Go scripting) and check win-rate
   distributions — e.g. that high-INT casters don't dominate every build.
