# Plan: realtime battle UX for Solana

Companion to [plan-realtime-battle-ux.md](./plan-realtime-battle-ux.md) /
[plan-realtime-battle-impl.md](./plan-realtime-battle-impl.md), which covered EVM only and
explicitly scoped Solana out. This is that follow-up. Same target end state as EVM: one wallet
signature per battle, a live strike-by-strike animation that starts before settle is mined, and
the on-chain result always wins. Getting there is **not** a mechanical port of the EVM work —
one piece reuses existing code for free, one piece is a real program change, and one piece is an
open security bug that needs fixing regardless of whether the rest of this plan ever ships.

## Current state (confirmed in code, not assumed from the EVM pattern)

- **The train/level-up front-run reroll exists on Solana today, unfixed.**
  `settle_battle.rs:60-71` reads `attacker_pet.dna/rarity/level` and `defender_pet.dna/rarity/level`
  **live** at settle time. `BattleRequest` (`state/requests.rs:66-74`), populated in
  `commit_battle.rs:56-63`, stores only owner pubkeys, pet ids, the randomness account, and the
  commit slot — no stat snapshot. `level_up.rs` has no check for a pending `battle_request`
  (confirmed by reading it end to end: pause, ownership, max-level, and fee are the only checks).
  So: commit a battle you're about to lose, call `level_up`, settle a win. Same exploit Phase 1
  closed on EVM, still open here.
- **`settle_battle` is not permissionless, unlike EVM's `settleBattle`.**
  `settle_battle.rs:176-177`: `attacker_owner: Signer<'info>`. The account also receives the
  `battle_request`'s rent refund on close (`close = attacker_owner`, line 208). A backend keeper
  has no wallet to sign as the attacker, so it cannot call this instruction as written.
- **But the permissionless-account pattern is already proven, in this exact program.**
  `cancel_battle.rs:40-56` — the *same* `attacker_owner` field, in the *same* kind of
  `close = attacker_owner` constraint, is declared `UncheckedAccount<'info>` (not `Signer`) and
  the instruction has no signer check on it at all (its own doc comment: "Permissionless cleanup
  ... anyone may close the stuck BattleRequest"). This is direct, existing evidence that dropping
  `Signer` while keeping `close =` targeting the same account is a pattern Anchor supports and
  this codebase already uses — not a novel or risky change.
- **`settle_breed.rs` and `settle_mint.rs` have the identical `owner: Signer<'info>` pattern**
  (plus a separate `asset: Signer<'info>` — a fresh, throwaway Metaplex Core asset keypair the
  caller generates for the new NFT, unrelated to the player's own wallet; the current frontend
  already generates one of these per mint/breed, so a keeper doing the same is not new
  capability, just relocated).
- **Skill config is a hardcoded Rust constant, not an on-chain tunable, unlike EVM.**
  `battle_sim.rs` takes `sc: &SkillConfig` as a parameter everywhere (mirroring EVM/Go/TS
  exactly), but every call site in `settle_battle.rs`/tests passes `&SkillConfig::default()`.
  `GlobalState` (`state/global.rs:90-140`) has no skill-config fields at all. This is actually
  *simpler* for a client-side replay than EVM: there is nothing to read live — mirror the same
  hardcoded constants client-side, and they can only drift from the contract on a program
  upgrade that changes `SkillConfig::default()`, not silently at runtime.
- **The combat math itself needs no new port.** `shared/src/utils/combat/` (built for EVM's
  Phase 3) is one of the golden-vector-verified implementations of the *same* fight math
  `battle_sim.rs` implements — `battle_sim.rs`'s own header comment says as much ("mirrors
  `CombatSimV1.sol` move-for-move"). Reusing it for Solana needs no new simulator port, just
  Solana-shaped inputs (see Workstream S3).
- **The frontend already has the "two signatures" problem this plan would fix.**
  `shared/src/utils/solana/battleWithSwitchboardVrf.ts` sends both the commit tx and the
  reveal+settle tx from the player's own wallet (`sendSignedTx(provider, ...)` both times,
  its own comment: "wallet prompt 1 of 2" / "wallet prompt 2 of 2" and "two wallet signatures is
  the minimum" in `switchboardVrfTx.ts:34`). That comment describes the current design, not a
  Switchboard protocol requirement — see Workstream S2.
- **No test coverage exists for any of this today.** `tests/cryptopets.ts`'s own header and a
  trailing `TODO` say the Switchboard On-Demand commit/reveal test harness
  (`Randomness.create`/`commitIx`/`revealIx` against a local validator) was never built, so
  `commit_battle`/`settle_battle`/breed/mint and everything downstream of them (pets exist only
  via settle) have zero test coverage. `Anchor.toml` already loads the Switchboard and mpl-core
  programs at genesis for this purpose; nothing exercises them yet.
- **This working environment cannot compile or test any of this.** Verified directly: no
  `cargo`, `anchor`, `rustc`, or `solana` CLI on PATH. Any Rust/Anchor change made here has to be
  compiled and tested on a machine (or CI) that has the toolchain — unlike every phase of the EVM
  plan, where I could write, compile, and test in the same session.

## Threat model (mirrors the EVM plan's, same underlying issue)

Identical shape to the EVM train-front-run reroll: `settle_battle` computes the outcome from
*(current pet stats, seed)* instead of *(committed-at-commit-time stats, seed)*, and nothing
blocks the stats from changing in between. Fixing it (Workstream S1) is valuable on its own,
independent of whether S2/S3 ever ship.

## Workstream S1 — snapshot battle inputs at commit time (security fix, do this regardless)

- Extend `BattleRequest` (append fields, mirroring `PendingBattle`'s Phase 1 extension):
  `attacker_dna: u64`, `defender_dna: u64`, `attacker_rarity: u8`, `defender_rarity: u8`,
  `attacker_level: u16`, `defender_level: u16`, `attacker_species_id: u16`,
  `defender_species_id: u16`. Update `BattleRequest::SPACE` to match.
- `commit_battle.rs` populates these from `attacker_pet`/`defender_pet` at commit time (both
  accounts are already in scope there).
- `settle_battle.rs` reads dna/rarity/level/species from the snapshot fields instead of the live
  `attacker_pet`/`defender_pet` accounts for the `battle_sim::simulate(...)` call and the XP
  level-diff calc. `win_count`/`loss_count`/`add_xp`/`record_battle_opponent` still mutate the
  *live* pet accounts — same as EVM, only the sim inputs freeze.
- No `battle_sim.rs` math changes, no golden-vector risk. `BattleRequest` is a short-lived
  per-commit account (not a long-reserved-space account like `PetAccount`), so growing its
  `SPACE` is a plain breaking change to the account layout, not a migration — fine given devnet
  data is disposable (same reasoning `plan-contract-upgrade.md` already applies elsewhere).
- **Checked, resolved**: `settle_breed.rs` also reads `parent1.dna`/`parent2.dna`/`.rarity` live
  (lines 39-40, 57-58) rather than from `BreedRequest`, but this is not the same bug — dna and
  rarity are immutable post-mint on Solana (no `change_dna`-equivalent or rarity-mutating
  instruction exists), so "live" and "snapshotted" reads return identically. S1 stays scoped to
  battle only.
- **Verification blocker**: proving this closes the reroll needs a working commit → reveal →
  settle cycle in a test (mint two pets, commit a battle, `level_up` one of them, settle, assert
  the result matches the pre-level-up snapshot) — exactly the EVM Phase 1 test's shape. That
  needs the Switchboard test harness below to exist first.

## Workstream S2 — make settle permissionless + build a Solana settle keeper

- Change `SettleBattle`'s `attacker_owner` from `Signer<'info>` to `UncheckedAccount<'info>`
  (`mut`), matching `cancel_battle.rs`'s `CancelBattle` accounts struct field-for-field. The
  existing `require_keys_eq!` authorization checks in the handler body don't need to change —
  they already check the account's *key*, not that it signed.
- Whoever submits the transaction (the keeper) becomes the fee payer and the signer of record;
  `attacker_owner` is passed purely as a pubkey reference for authorization checks and the rent-
  close destination, same role `cancel_battle` already gives it.
- **Checked, and this is not a mechanical extension to breed/mint like it was on EVM.**
  `settle_breed.rs:136-137` and `settle_mint.rs:89-90` both pass
  `.payer(&ctx.accounts.owner.to_account_info())` (and `.owner(Some(&ctx.accounts.owner...))`)
  into the Metaplex Core `CreateV1CpiBuilder` for the newly-minted asset. Metaplex Core's create
  CPI requires the payer to actually sign, to authorize debiting their lamports for the new
  asset's rent — dropping `owner: Signer` there the way S2 does for battle would compile but
  fail at runtime the first time anyone actually tries to settle a breed/mint. `settle_battle`
  has no such CPI at all, which is why it isn't affected. Extending keeper coverage to
  breed/mint therefore needs an actual design answer to "who pays for and owns the new asset
  when a keeper (not the player) submits settle" — e.g. the keeper fronts the rent and the
  player is set as `.owner(...)` only (no payer signature needed from them), or some other
  restructuring — not a copy-paste of the battle change. Scoping S2 to **battle only** until
  that's decided.
- **New keeper module.** Solana's stack (`@solana/web3.js`, `@coral-xyz/anchor`,
  `@switchboard-xyz/on-demand`) shares nothing with the EVM keeper's `viem`-based code — per
  AGENTS.md's "no shared cross-chain interface" rule, this is genuinely new code, not a port.
  Recommend a sibling module, e.g. `backend/src/features/settle-keeper-solana/`, not shoehorned
  into the EVM keeper's files.
- **The watch mechanism differs from EVM's event subscription.** Pyth Entropy fires a `Revealed`
  log the keeper can subscribe to. Switchboard On-Demand's existing client code
  (`waitForRevealIx` in `switchboardVrfTx.ts:82-99`) is already a *poll-until-ready* retry loop,
  not an event watch — the keeper should mirror that same polling shape against each open
  `BattleRequest`'s `randomness_account`, not invent an event-driven design that doesn't match
  how this SDK actually signals readiness.
- Frontend: `battleWithSwitchboardVrf.ts` stops sending the reveal+settle tx in the normal path;
  `useBattlePanel`-equivalent Solana flow gets the same kind of fallback-timeout the EVM
  `FALLBACK_SETTLE_DELAY_MS` pattern uses, so a keeper outage still self-heals from the player's
  own wallet rather than stranding the battle.

## Workstream S3 — live animation (cheap once S1 lands, reuses existing code)

- No new combat-simulator port: `shared/src/utils/combat/` already produces bit-identical results
  to `battle_sim.rs` (enforced by the shared golden vectors). Confirm this claim isn't stale by
  running the golden-vector suite before relying on it — it was true as of Phase 3/4, but treat
  "should still be true" as a thing to verify, not assume, before building on it.
- Read the frozen snapshot from `BattleRequest` (once S1 lands) the moment commit confirms —
  same principle as EVM's Phase 4 "read the snapshot, not the live/cached roster."
- Skill config: hardcode the same constants `SkillConfig::default()` uses (see "Current state"
  above) rather than trying to read something that isn't stored on-chain.
- **Resolved (implemented, not devnet-verified)**: there is no separate on-chain "reveal" moment
  before settle the way Pyth's `Revealed` event gives EVM — the keeper bundles reveal+settle into
  one transaction. `useLiveBattleReplaySolana` (`shared/src/hooks/chains/solana/`) gets the seed by
  independently calling the same `randomness.revealIx()` the keeper will call (which round-trips to
  the Switchboard gateway) but never broadcasting the resulting instruction — it Borsh-decodes it
  locally to read the revealed `value` back out. The exact byte encoding of that `value` (array vs.
  hex/base64 string) isn't verifiable without a live gateway round-trip in this environment, so the
  decode is defensive: any unrecognized shape yields `null` (no live animation that battle, same UX
  as before this feature existed) rather than a broken UI. **Verify against a real Switchboard queue
  (devnet or mainnet) before trusting this in production.** Two other options were considered and
  rejected for now: splitting the keeper's reveal+settle into two transactions and polling the
  now-revealed `RandomnessAccountData` account (closer to EVM's model, but a bigger change to the
  already-verified keeper and still has an unknown on-chain field name), and skipping pre-settle
  animation entirely (lowest risk, no enhancement).
- Reconciliation rule is unchanged: the Anchor `BattleResolved` event (already parsed client-side
  in `parseFirstWins`) is always authoritative; the local sim only ever drives the animation.

## The testing-infrastructure gap: resolved as a devnet-only script, not a local-validator harness

Unlike every EVM phase (where Hardhat + `MockEntropy` already existed and I could write a real,
running test the same session), Solana had **zero** test coverage for anything that depends on a
settled battle/breed/mint. Investigating why revealed this isn't just "no mock exists yet" —
Switchboard On-Demand has **no local-validator path at all**: `getDefaultQueue()` only resolves
real mainnet/devnet queue accounts, and `revealIx()` calls out to a live Switchboard gateway (an
actual internet-connected oracle operator) for a signed reveal. Neither exists on a fresh local
validator regardless of whether the Switchboard program's bytecode is genesis-loaded per
`Anchor.toml` — that only gets you the on-chain program, not the queue/oracle state or the
off-chain gateway service the reveal flow depends on.

`contracts/solana/cryptopets/scripts/devnet-battle-harness.ts` is the result: a manually-invoked
script (deliberately outside `tests/` so `anchor test`'s local-validator glob never picks it up)
that runs the real commit_mint → settle_mint (x2) → commit_battle → level_up → settle_battle
sequence against real Solana devnet + Switchboard's real devnet queue. It proves S1 directly (reads
`BattleRequest` before and after a level_up on the attacker's pet and asserts the frozen
`attackerLevel` didn't move while the live `PetAccount`'s did) and S2 directly (submits
`settle_battle` from a third keypair unrelated to either battler). It does **not** re-verify the
combat math itself (the golden vectors already do that) or the S3 reveal-decode trick (that needs
its own live-browser check; see `useLiveBattleReplaySolana.ts`'s header comment).

**Not run in this environment**: no toolchain, and no reachable network at all here (confirmed:
even `pnpm add` to the npm registry timed out) — written from reading the program source and
existing test/script conventions directly, never executed. Needs a funded devnet wallet
(`faucet.solana.com`) and `pnpm --filter solana add -D @switchboard-xyz/on-demand` run somewhere
with registry access before `pnpm exec tsx scripts/devnet-battle-harness.ts` can work. See the
script's own header comment for full usage and safety notes (it writes real on-chain state).

## Environment caveat (read before starting)

This repo's current working environment (verified directly: no `cargo`/`anchor`/`rustc`/`solana`
on PATH) cannot build or run any of S1/S2/the test harness. Any Rust/Anchor code written here
needs a machine or CI job with the toolchain installed to compile and test it — the write-then-
verify-in-the-same-session loop that worked for every EVM phase does not work here. Plan for a
review/verification handoff step explicitly, rather than assuming "green tests" the way the EVM
plan could.

## Open decisions (need your input before implementation)

1. **Keeper hosting**: new sibling module under `backend/src/features/` (recommended) vs. a
   fully separate service given the completely different dependency stack.
2. **Scope of S2 beyond battle**: extending to breed/mint needs a real design decision (who
   pays for / owns the newly-minted asset when a keeper submits settle instead of the player —
   see Workstream S2), not just the mechanical Signer-drop battle got. Deferred; battle-only
   for now.
3. **Resolved**: the harness is a devnet-only script (`scripts/devnet-battle-harness.ts`), not a
   local-validator test — see the section above for why a local-validator version isn't possible
   with this SDK. S1/S2 were implemented ahead of running it, same as the rest of this plan.
4. **Who runs `anchor build`/`anchor test`/the devnet harness** to actually verify all of this,
   given neither the toolchain nor network access is available in this environment — you, CI, or
   a different agent/environment?

## Suggested order

1. ~~Build the Switchboard commit/reveal Anchor test harness~~ — done, but as a devnet-only
   script (`scripts/devnet-battle-harness.ts`), not a local-validator test; see above.
2. Workstream S1 (snapshot fix) — done.
3. Workstream S2 (permissionless settle + Solana keeper) — done.
4. Workstream S3 (live animation) — done, with its own unverified-decode caveat.

All four items are implemented and committed. What remains is verification: `anchor build`/
`anchor test` for the Rust changes, and running `devnet-battle-harness.ts` and a real Switchboard
gateway check for the S3 reveal-decode assumption — see "Environment caveat" above for why none
of that could happen in this session.

## Out of scope

- Any change to `battle_sim.rs`'s actual math/balance.
- Species tiers, marriage, or breeding mechanics beyond whatever S1 needs to check for breed.
- Re-verifying or touching anything on the EVM side — that plan is already fully implemented.
