# Plan: real-time battle UX (single wallet signature, live blow-by-blow animation)

> Implementation spec with architecture diagrams, file-by-file work items, and per-phase
> verification: [plan-realtime-battle-impl.md](./plan-realtime-battle-impl.md).

Scope: EVM battle flow only (`contracts/ethereum`, `frontend`, `shared`, and a new small keeper
service). Solana already uses a commit->settle pattern with its own frontend flow
(`shared/src/utils/solana/battleWithSwitchboardVrf.ts`); applying the same live-animation idea
there is a separate follow-up, not covered here.

## Current state (confirmed in code)

- `GameLogic.sol` already splits battle into `requestBattle` (player-signed, pays the Pyth
  Entropy fee) and `settleBattle` (permissionless, runs the deterministic sim) -
  `contracts/ethereum/src/GameLogic.sol:160-250`.
- The frontend calls `settleBattle` itself via the player's connected wallet
  (`shared/src/hooks/chains/ethereum/useEvmBattleFlow.ts:71-85`), which is why the player sees a
  second MetaMask prompt for a step that does not need their signature.
- The Pyth `Revealed` event already carries the raw `randomNumber` used for the battle
  (`shared/src/hooks/chains/ethereum/useWatchEntropyFulfillment.ts:13`), but the frontend
  currently only reads `sequenceNumber` from it and discards the random word.
- `CombatSim.sol`'s simulation is a pure function of `(dna, rarity, level, skill)` for both pets,
  one random word, and a `SkillConfig` struct, ported today in two places: Solidity
  (`contracts/ethereum/src/CombatSim.sol`) and Go
  (`indexer-go/internal/combat/{sim,dna,rng,skills,strike,xp}.go`), kept in sync via
  `contracts/test-vectors/battle.json`.
- **The `SkillConfig` values are admin-tunable on-chain, not constants**: `GameConfig` has an
  owner setter per value and `getSkillConfig()` assembles the struct live
  (`contracts/ethereum/src/GameConfig.sol:207-218`). Any client-side sim must read this config
  from chain, never hardcode it.
- Breed and mint use the same request -> entropy -> settle shape as battle (`settleBreed`,
  `settleMint`), with the same frontend-signed settle transaction, i.e. the same
  second-signature problem.

## Known race: sim inputs can drift between request and settle

`settleBattle` reads both pets via `petCore.getPet()` at settle execution time
(`GameLogic.sol:205-206`), not at request time. Nothing blocks `train()` while a battle is
pending (`GameLogic.sol:517` checks only the train cooldown, not `petBattleRequestId`), so a pet
can gain XP and level up between `requestBattle` and `settleBattle`. If that happens, the
on-chain sim runs with the new level while any client-side sim ran with the old one - a
divergence that occurs even with a bit-perfect TS port.

Consequences for this plan:

- Client/chain mismatch is **not** always a parity bug; it can be this race. Reconciliation
  (Workstream B) must handle it gracefully, not just log it as a defect.
- Mitigation, client side: read sim inputs (`getPet` for both pets + `getSkillConfig`) directly
  from chain via multicall at `Revealed` time - never from the indexer/backend roster cache,
  which lags. This shrinks the race window to the few seconds between reveal and settle.
- Proper fix, contract side (optional Workstream C): snapshot `(dna, rarity, level, speciesId)`
  for both pets into `PendingBattle` at request time and have `settleBattle` use the snapshot.
  This eliminates the race entirely and also fixes a fairness quirk (a pet's level changing
  mid-flight alters an already-committed battle). Cost: a bigger `PendingBattle` struct (one
  extra storage write per battle) and a UUPS upgrade. Contracts are testnet-only and
  upgradeable, so this is cheap now and expensive later.

## Goal

1. Player signs once (`requestBattle`). `settleBattle` is submitted by a backend keeper, not the
   player's wallet.
2. The moment entropy resolves, the frontend runs the same combat math locally and animates the
   fight round by round, without waiting for `settleBattle` to be mined.
3. The on-chain `BattleResolved` event stays the source of truth for persisted stats/XP/cooldowns;
   the client-side simulation is presentation only.

## Workstream A: settle keeper (removes the second signature)

Removes the player-signed settle call and replaces it with a backend-submitted one - for
battles, and (recommended) breeds and mints too, since they share the same flow and the same
infrastructure settles all three.

- **New service**: a minimal Node/TS process, `backend/src/features/battle-keeper/` (recommended
  over adding this to `indexer-go`, since `indexer-go` today only reads chain state and has no
  transaction-signing path; the keeper can reuse the same ABI JSONs and `viem` tooling the
  frontend already depends on).
- **Request-type tracking**: `_fulfill` deletes `_requestTypes[requestId]` when entropy is
  revealed (`GameLogic.sol:421`), so post-reveal chain state cannot tell a battle from a breed
  or mint. The keeper must build its requestId -> type map from the request events
  (`BattleRandomnessRequested`, and the breed/mint equivalents), then act on `Revealed`.
- **Watch + settle**: subscribe to the Entropy contract's `Revealed` event filtered by
  `caller == GameLogic` (same filter shape as `useWatchEntropyFulfillment.ts`). Skip events with
  `callbackFailed == true` - the randomness was never stored, and settling would revert with
  "Entropy not yet fulfilled". For each fulfilled tracked request, submit the matching settle
  call from a funded hot wallet.
- **Startup backfill**: on boot, scan past request events minus `BattleResolved`/settled/cancelled
  ones and settle anything left pending, so a keeper outage self-heals on restart.
- **Tx hygiene**: submit settles through a sequential nonce queue (one in flight at a time is
  fine at this volume) with a stuck-tx gas-bump policy. `settleBattle` is permissionless and
  reverts harmlessly if already settled, so duplicate submission (e.g. racing the frontend
  fallback) is a wasted-gas issue, not a correctness one.
- **Frontend change**: `useEvmBattleFlow.ts` stops calling `settle.writeContract` itself. It keeps
  watching for `BattleResolved` (the secondary path already at lines 134-149 covers "settled by
  something else"). Add a "force settle" fallback button, using the exact same permissionless
  call, gated behind a timeout (e.g. 30-60s after `Revealed` with no `BattleResolved`) so a
  keeper outage never strands a battle.
- **Funding**: the keeper wallet pays gas per settle (cents on an L2 per
  `contracts/plan-contract-upgrade.md` §3.6's cost table). Needs a top-up/balance-alert plan before
  any live deployment; out of scope for this doc, flagged as an open decision below.

Verification: local Hardhat node + Pyth mock entropy provider, run a full battle end to end,
assert `settleBattle` lands without a second wallet prompt and `BattleResolved` fires. Existing
Hardhat entropy-mock test setup should be reused, not reinvented, check
`contracts/ethereum/test/` for the current mock before writing a new harness. Also verify the
outage path: kill the keeper mid-battle, confirm the frontend fallback settles, restart the
keeper, confirm backfill doesn't double-settle.

## Workstream B: client-side sim port + live animation

Ports the combat math to TypeScript so the frontend can animate the fight the instant entropy
resolves, independent of when `settleBattle` gets mined.

- **New port - fight only, not XP**: `shared/src/utils/combat/` mirroring the fight-sim files of
  `indexer-go/internal/combat/` (`dna.ts`, `rng.ts`, `sim.ts`, `skills.ts`, `strike.ts`).
  Deliberately do **not** port `xp.go`: XP depends on on-chain same-opponent streak state
  (`recordBattleOpponent`) the client can't reliably know, and `BattleResolved` already emits
  `xpWin`/`xpLoss` - show XP from the event when it lands. This keeps the fourth port's
  maintenance surface to the fight math only.
- **Config as input, never hardcoded**: the TS sim takes the `SkillConfig` struct as a parameter,
  exactly like `CombatSim.simulate` does. The frontend reads it live from
  `GameConfig.getSkillConfig()`; the golden-vector suite constructs whatever config values the
  vectors assume (mirror how `combat_golden_test.go` handles this).
- **Golden vectors**: a new vitest suite (e.g. `shared/src/utils/combat/__tests__/goldenVectors.test.ts`)
  consuming `contracts/test-vectors/battle.json` directly (relative import across the workspace),
  the same file Hardhat, Anchor, and `combat_golden_test.go` already consume. Assert the fight
  fields (winner, rounds, HP remaining, crit count); XP fields are out of the port's scope. No
  new vector format.
- **Sim inputs from chain, not cache**: on `Revealed`, read `randomNumber` off the log (currently
  discarded in `useWatchEntropyFulfillment.ts`) and multicall `petCore.getPet(petId1)`,
  `getPet(petId2)`, and `gameConfig.getSkillConfig()` for the exact inputs the contract will use.
  Do not feed the sim from `usePetList`/`useOpponents` - those are indexer projections and lag
  the chain (see the input-drift section above).
- **Wiring**: a new hook (e.g. `useLiveBattleReplay.ts`) composed into `useEvmBattleFlow.ts`
  produces a round-by-round log (attacks, crits, element multipliers, HP remaining).
- **Animation**: a new consumer under
  `frontend/src/components/pet/interactions/panels/battle/parts/` plays the round log
  sequentially with per-round timing, replacing (or extending) the current
  taunts-then-static-result flow in `battle-overlay`.
- **Result sequencing**: the keeper will usually land `BattleResolved` *before* the animation
  finishes. The result screen must gate on animation completion, not on the event - no jump-cuts.
  Likewise the roster refetch in `handleSuccess` shouldn't visibly update stat panels
  mid-animation.

### Reconciliation and the mismatch UX

The core rule that makes every divergence case handleable: **the final winner card is only ever
rendered from `BattleResolved` data (winner, `xpWin`/`xpLoss`, `winnerHpRemaining`), never from
the local sim.** The local sim drives only the round-by-round animation. Because the verdict is
event-gated, a mismatch can never retract a result the user was already shown - the wrong
outcome only ever existed as animation frames, not as a declared winner.

Flow by case:

- **Common case - event arrives mid-animation, results match**: animation plays to its natural
  end, then the result card appears with the on-chain winner and XP, plus a tx-hash link
  ("verified on-chain"). The user never notices the reconciliation happened.
- **Event hasn't arrived when the animation ends** (slow keeper / user's force-settle pending):
  hold on a short "Finalizing on-chain..." state after the last round instead of showing a
  provisional winner. The existing force-settle fallback timer covers the stuck case.
- **Mismatch detected mid-animation** (the input-drift race, or a parity bug): stop the local
  playback at the current round with a brief interstitial - screen flash + a line like "The
  on-chain referee ruled differently - syncing the true result..." - then show the standard
  result card built from the event, visually identical to the normal one, with a small notice
  that the outcome was corrected from chain and the tx link. Do not fabricate extra "comeback"
  rounds to paper over the disagreement: the HP bars would contradict the rounds already shown,
  and honest re-sync framing is cheaper and more trustworthy than fiction that can be caught.
- **Either way, XP and remaining HP on the result card come from the event**, so those numbers
  are never wrong even when the animation was.

Telemetry: every mismatch fires a divergence report to the backend (both pets' input stats as
read at `Revealed` time, the `SkillConfig` used, the seed, the local summary, and the on-chain
summary) plus a `console.error` in dev. Expected frequency is ~never - inputs are read seconds
before settle and the golden vectors enforce parity - so any report is a real signal: input
drift (benign, self-explains from the logged inputs) or a TS-port parity bug (add a golden
vector, fix the port). If Workstream C's snapshot ships, input drift becomes impossible and any
divergence report should be treated as an error-level alert on the port itself.

Verification: `pnpm --filter @shared/core test -t combat` for the port/golden-vector parity, then
a manual run against local Hardhat + entropy mock to confirm the live animation actually plays
and matches the eventual on-chain result.

## Threat model: can users cheat under this plan?

What the plan makes impossible or closes:

- **Forging a result**: the client sim is presentation only; XP, win/loss, and levels are written
  exclusively by `settleBattle`, recomputed on-chain from committed state + the entropy seed. A
  modified client lies only to its own screen.
- **Rerolling bad randomness**: `cancelBattle` reverts once entropy is fulfilled
  (`GameLogic.sol:262`), so after reveal the only remaining move is settle.
- **Abandoning a losing battle**: the keeper closes this. Today a player who computes a loss
  (the Go sim is public) can simply never settle, locking both pets. With the keeper settling
  within seconds, refusing to settle stops being an option.
- **Keeper abuse**: `settleBattle` is permissionless and deterministic - the keeper cannot pick
  outcomes, censorship is bypassable by anyone settling, and a compromised keeper wallet loses
  only gas funds.
- **Randomness bias**: Pyth Entropy's commit-reveal means the requester cannot predict or steer
  the combined output.

**The one real cheat left open without Workstream C - the train front-run reroll**: after
reveal, the outcome is fully determined by *(current pet stats, seed)*, but `settleBattle` reads
stats at settle time and nothing blocks `train()` while a battle is pending
(`GameLogic.sol:517`). A player whose client computes "I lose, but I win if my pet levels up"
can front-run the keeper's settle with a `train()` and flip a committed loss - deterministically,
so the train fee is only ever spent when it provably works. This race predates the plan, but
shipping a TS sim in the frontend drops the exploit's skill floor from "reads the open-source Go
sim" to "anyone with a modified client". **Workstream C eliminates it entirely and is therefore
a prerequisite for Workstream B**, not optional hardening. (Workstream A alone does not worsen
this and can still ship first.)

Pre-existing gaps this plan does not create or fix (documented v1/v2 baseline in
`contracts/plan-contract-upgrade.md`): no defender consent on `requestBattle` (§3.5), and sybil
XP farming across wallets, mitigated but not eliminated by same-opponent decay (§3.4).

## Workstream C (contract hardening, required before B): snapshot sim inputs at request time

Extends `PendingBattle` with both pets' `(dna, rarity, level, speciesId)` captured in
`requestBattle`, and makes `settleBattle` simulate from the snapshot instead of re-reading
`petCore.getPet()`. Eliminates the input-drift race at the root and makes every committed battle
deterministic from its request tx + revealed randomness.

- Small UUPS upgrade to `GameLogic` (the struct lives in a private mapping; extending it is safe
  for new requests, but deploy when no battles are pending, or have the upgrade path drain them).
- Aligns with `plan-contract-upgrade.md` §8.1's rule that outcomes be pure functions of committed
  state + seed - "committed" should mean request-time state.
- If C ships, Workstream B's reconciliation mismatch case reduces to "parity bug only", and the
  client can even sim from the request receipt's data without the multicall.
- **Sequencing**: not a blocker for A, but a prerequisite for B - without it, the TS sim makes
  the train-front-run reroll (see threat model above) exploitable from a modified client.

## New ongoing obligation

`AGENTS.md`/`CLAUDE.md` currently say the combat simulator is ported three times (Solidity, Rust,
Go) and must be updated together. After this work it is ported **four** times (fight math only -
the TS port excludes XP). Any future combat balance change touches four implementations and
reruns four test harnesses (Hardhat, Anchor, `go test ./internal/combat`, and the new `shared`
vitest suite), not three. This is a real, permanent maintenance cost, not a one-time migration
cost, worth confirming you want before starting Workstream B. Both `AGENTS.md` and `CLAUDE.md`
must be updated to name the fourth port when it lands. Workstream A (the keeper) carries no such
cost and can ship independently.

## Open decisions (need your input before implementation)

1. **Keeper hosting**: new `backend/src/features/battle-keeper/` (recommended) vs. a standalone
   package vs. extending `indexer-go` with a signing path. Backend is simplest since it is already
   Node/TS and can reuse frontend/shared ABI JSONs; indexer-go would need net-new
   transaction-signing infrastructure it doesn't have today.
2. **Keeper scope**: battles only, or battles + breeds + mints (recommended - same infra, fixes
   the same double-signature UX in all three flows).
3. **Keeper wallet funding and gas monitoring**: who funds it, on which networks (local Hardhat
   only, Sepolia, or a production L2), and what alerts on low balance.
4. **Do you want Workstream B (client-side sim + live animation) at all**, given the four-port
   maintenance cost, or is the keeper alone (Workstream A) enough to fix the immediate double-signature
   complaint, with animation staying as-is (played after `BattleResolved`, not live)?
5. **Workstream C**: no longer optional if B is happening (see threat model - it blocks the
   train-front-run reroll). The only real decision is C's timing if B is deferred or dropped.
6. **Solana parity**: whether the same live-animation treatment is wanted for the Solana flow
   later, tracked as a separate follow-up either way.

## Suggested order

1. Workstream A (settle keeper) - fixes the double-signature UX problem on its own, no new combat
   port, smallest blast radius.
2. Workstream C (request-time snapshot) - the small `GameLogic` upgrade that makes B safe to ship
   (see threat model).
3. Workstream B (TS sim port + golden vectors) - can land independently and be tested in isolation
   before wiring it into live animation.
4. Wire B's output into the battle overlay once A, C, and B are each verified separately.

## Out of scope for this plan

- Any change to `CombatSim.sol`'s actual math/balance (this is a UX/architecture change, not a
  balance change).
- Per-attack transactions or any on-chain change to how battles are resolved. The existing
  request/settle split is already correct for this; the change here is entirely about who signs
  `settleBattle` and where the animation gets its data from.
- Solana battle flow changes.
- Account abstraction / session keys / meta-transactions for `requestBattle` itself. Not needed to
  solve the stated problem, and a materially bigger change than either workstream above.
