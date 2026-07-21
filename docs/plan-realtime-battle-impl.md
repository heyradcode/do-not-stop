# Implementation plan: real-time battle UX

Companion to [plan-realtime-battle-ux.md](./plan-realtime-battle-ux.md), which holds the
rationale and threat model. This document is the build spec: architecture, file-by-file work
items, and verification per phase. It is written to be executed top to bottom; each phase has a
definition of done and must be committed separately by the user before the next phase starts.

Read before starting: `CLAUDE.md` (working guidelines, per-package commands), the threat-model
section of `plan-realtime-battle-ux.md`, and `contracts/ethereum/scripts/resolve-stuck-battle.ts`
(an existing script that already settles a stuck battle from Node; the keeper generalizes it).

## Hard rules for the implementing agent

1. NEVER edit `contracts/test-vectors/battle.json` or `xp.json`. If a golden-vector test fails,
   the port being written is wrong. Fix the port.
2. Do NOT touch `contracts/ethereum/src/CombatSim.sol`, `contracts/solana/**`, or
   `indexer-go/internal/combat/**` in any phase. Combat math is not changing.
3. Run only the scoped per-package command listed in each phase's verification, not the full
   monorepo suite.
4. New files match the license of their package: `contracts/ethereum` is MIT; `backend`,
   `shared`, `frontend` are PolyForm Noncommercial 1.0.0.
5. After each phase, draft a Conventional Commits message and stop. The user commits manually.
6. Work on a branch (e.g. `feat/realtime-battle-p<N>`), one branch per phase.
7. All integer math in the TS combat port uses `bigint`. DNA is 16 decimal digits (max ~1.1e16),
   which exceeds `Number.MAX_SAFE_INTEGER` (~9e15). No `number` arithmetic in sim code.

## Architecture

### Current flow (two signatures, no live animation)

```
player wallet                GameLogic (EVM)              Pyth Entropy         frontend
     |                            |                            |                   |
     |-- sign #1: requestBattle ->|-- requestV2 -------------->|                   |
     |                            |<- entropyCallback ---------|  (provider tx)    |
     |                            |   stores randomness        |                   |
     |                            |                            |-- Revealed evt -->| (watches, ignores randomNumber)
     |<- sign #2: settleBattle ---|------------------------------------------------| sends settle itself
     |                            |   runs CombatSim, writes XP/stats              |
     |                            |-- BattleResolved evt ------------------------->| shows static result
```

### Target flow (one signature, keeper settles, client animates live)

```
player wallet          GameLogic (EVM)           Pyth Entropy        keeper (backend)      frontend
     |                      |                         |                    |                  |
     |- sign: requestBattle>|  snapshots pet stats    |                    |                  |
     |                      |  into PendingBattle     |                    |                  |
     |                      |- requestV2 ------------>|                    |                  |
     |                      |<- entropyCallback ------|   (provider tx)    |                  |
     |                      |                         |-- Revealed evt --->|---- also ------->|
     |                      |                         |  (randomNumber)    |                  |
     |                      |<- settleBattle (keeper hot wallet) ----------|                  |
     |                      |  sims from SNAPSHOT, writes XP/stats         |     runs TS sim from
     |                      |                                              |     snapshot + randomNumber,
     |                      |-- BattleResolved evt ----------------------->|     animates round by round
     |                      |                          result card gates on event + animation end
```

Trust model: the TS sim is presentation only. `settleBattle` recomputes everything on-chain.
The keeper holds no authority (settle is permissionless and deterministic). The snapshot
(Phase 1) is what makes the revealed outcome immutable, killing the train-front-run reroll
described in the threat model.

### Phase order and dependencies

```
Phase 1: contract snapshot (Workstream C)     <- prerequisite for Phase 3/4
Phase 2: settle keeper (Workstream A)         <- independent of Phase 1, do after it anyway
Phase 3: TS combat port + golden vectors      <- needs nothing at runtime, pure library
Phase 4: live animation + reconciliation UX   <- needs 1, 2, 3
Phase 5: docs + guardrail updates             <- last
```

---

## Phase 1 - contract: snapshot sim inputs at request time

Package: `contracts/ethereum` (MIT). Branch: `feat/realtime-battle-p1-snapshot`.

### Why (one line)

`settleBattle` currently reads pet stats at settle time (`GameLogic.sol:205-206`); snapshotting
them at request time makes the outcome immutable once entropy reveals (threat model: blocks the
train-front-run reroll).

### Changes in `contracts/ethereum/src/GameLogic.sol`

1. Extend the `PendingBattle` struct (currently at `GameLogic.sol:88-94`) by APPENDING fields
   only. Never reorder or insert; the struct lives in a mapping and old entries must stay
   readable:

```solidity
struct PendingBattle {
    address requester;
    uint256 petId1;
    uint256 petId2;
    uint256 randomness;
    bool    fulfilled;
    // v1.1 snapshot (plan-realtime-battle-impl Phase 1). Captured in requestBattle;
    // settleBattle sims from these, not live state, so a train() between request
    // and settle cannot change a committed battle.
    bool    snapshotted;   // false for requests created before this upgrade
    uint256 dna1;
    uint256 dna2;
    uint32  level1;
    uint32  level2;
    uint8   rarity1;
    uint8   rarity2;
    uint16  speciesId1;
    uint16  speciesId2;
}
```

2. In `requestBattle` (after the existing checks, where the `PendingBattle` is stored around
   `GameLogic.sol:186-192`): read both pets once via `petCore.getPet(petId1)` /
   `getPet(petId2)` and populate the snapshot fields, `snapshotted = true`.

3. In `settleBattle` (`GameLogic.sol:200-250`): if `pending.snapshotted`, feed the sim and the
   XP math from the snapshot fields instead of the live `getPet` reads. If not (a request
   created before the upgrade), keep the existing live-read path unchanged. The XP level-diff
   multiplier (`_calcXp` call sites at lines 231-232) must use the snapshot levels too, so sim
   and XP agree on the same committed inputs. `updateBattleStats`, `recordBattleOpponent`,
   `addXp`, `triggerCooldown` still act on live pets (they mutate current state; that is
   correct).

4. Bump `VERSION` to `"1.1.0"`.

Storage-layout notes for the implementer:
- Appending fields to a struct used only as a mapping value is layout-safe; old entries return
  zero for new fields, which is why the `snapshotted` flag exists (never sim from an
  all-zeros snapshot).
- Do not touch the `uint256[40] __gap` (`GameLogic.sol:119`); mappings don't consume new slots.
- The deploy script already runs OZ `validateUpgrade`; it must pass.

### Tests (extend `contracts/ethereum/test/CryptoPetsV2.test.ts`)

Follow the file's existing fixture pattern (`MockEntropy` deployed separately, randomness
injected via `entropy.mockReveal`). Add:

1. `snapshot freezes battle inputs`: create two pets, `requestBattle`, then `train(petId1)`
   with enough XP to level it up, then `mockReveal` + `settleBattle`. Assert the emitted
   `BattleResolved` matches a local expectation computed with the PRE-train level (compute the
   expected winner by calling the deployed `CombatSim.simulate` view directly with the snapshot
   inputs from the test).
2. `pre-upgrade requests still settle`: harder to simulate in a fresh deploy; instead assert
   the fallback branch directly - store a battle request via the normal path, then settle, and
   separately unit-test that a `snapshotted == false` pending battle takes the live-read path
   (this can be covered implicitly by keeping one existing settle test green if it never
   populates the snapshot; if all requests now snapshot, add a comment explaining the branch is
   upgrade-migration-only and rely on review).
3. Existing battle tests must pass unchanged (same outcomes: snapshot inputs equal live inputs
   when nothing mutates between request and settle).

### Verification

```bash
pnpm --prefix contracts/ethereum hh test test/CryptoPetsV2.test.ts
pnpm --prefix contracts/ethereum hh test test/CombatGoldenVectors.test.ts   # must stay green
pnpm --prefix contracts/ethereum test                                        # full package suite
```

Definition of done: all three commands pass; `validateUpgrade` in the deploy script passes; no
change to `CombatSim.sol` or the vectors.

---

## Phase 2 - backend: settle keeper

Package: `backend` (PolyForm NC). Branch: `feat/realtime-battle-p2-keeper`.

### Component design

```
backend/src/features/settle-keeper/
    index.ts       start()/stop(); wired into server.ts, gated by env.keeperEnabled
    abi.ts         minimal hand-written ABIs (see below), NOT the full JSON artifacts
    requests.ts    requestId -> {type, petId1, petId2} tracking + startup backfill
    submitter.ts   viem wallet client; sequential submit queue; simulate-before-send
    keeper.ts      orchestrator: subscribes, decides, delegates to submitter
```

Add `viem` to `backend/package.json` dependencies (the backend has no chain client today).

### ABIs to embed in `abi.ts` (verified against `GameLogic.sol`)

Events on GameLogic:
- `BattleRandomnessRequested(address indexed requester, uint256 indexed requestId, uint256 petId1, uint256 petId2)`
- `BreedRandomnessRequested(address indexed owner, uint256 indexed requestId, uint256 petId1, uint256 petId2)`
- `MintRequested(address indexed owner, uint256 indexed requestId)`
- `BattleResolved(uint256 indexed requestId, uint256 indexed winnerId, uint256 indexed loserId, uint256 randomness, bool firstWins, uint8 rounds, uint16 winnerHpRemaining, uint32 xpWin, uint32 xpLoss)`
- `BreedSettled(address indexed owner, uint256 indexed childId, uint256 indexed requestId, address studFeePaidTo)`
- `MintSettled(address indexed owner, uint256 indexed petId, uint256 indexed requestId)`

Functions on GameLogic: `settleBattle(uint256)`, `settleBreed(uint256)`, `settleMint(uint256)`,
`entropy() view returns (address)`.

Event on the Entropy contract (copy the exact ABI object from
`shared/src/hooks/chains/ethereum/useWatchEntropyFulfillment.ts:4-22`):
- `Revealed(address indexed provider, address indexed caller, uint64 indexed sequenceNumber, bytes32 randomNumber, bytes32 userContribution, bytes32 providerContribution, bool callbackFailed, bytes callbackReturnValue, uint32 callbackGasUsed, bytes extraArgs)`

### Keeper algorithm

```
on start:
  read env: rpcUrl, privateKey, gameLogicAddress, chainId, backfillBlocks
  entropyAddress = gameLogic.read.entropy()
  BACKFILL: from = latestBlock - backfillBlocks
    requested = getLogs(gameLogic, [BattleRandomnessRequested, BreedRandomnessRequested, MintRequested], from)
    settled   = getLogs(gameLogic, [BattleResolved, BreedSettled, MintSettled], from)
    pendingSet = requested - settled           # by requestId
    for each pending requestId: trySettle(requestId, type)
  SUBSCRIBE (viem watchEvent, poll fallback):
    gameLogic request events   -> track(requestId -> type)
    entropy Revealed, filter caller == gameLogicAddress:
        if callbackFailed: log error, skip (randomness never stored; settling reverts)
        if sequenceNumber tracked: trySettle(requestId, type)
    gameLogic settled events   -> untrack(requestId)

trySettle(requestId, type):
  fn = settleBattle | settleBreed | settleMint by type
  simulate fn(requestId) via eth_call from the keeper address
    revert "No pending battle" / "..." -> already settled or cancelled: untrack, done
    revert "Entropy not yet fulfilled" -> keep tracked, wait for Revealed
    success -> submitter.enqueue(fn, requestId)

submitter:
  one tx in flight at a time (sequential nonce management, volume is tiny)
  gas limit 800_000 for settleBattle/settleBreed, 500_000 for settleMint
    (mirror shared/src/hooks/chains/ethereum/gasLimits.ts; RPC gas estimation fails on these)
  on receipt revert: log and drop (someone else settled first; harmless)
  if no receipt after N blocks: re-send with bumped priority fee, max 2 bumps, then log error
```

Notes:
- `cancelBattle` emits NO event (`GameLogic.sol:255-268`), so a cancelled request is
  indistinguishable from a pending one by logs alone. The simulate-before-send step is the
  authoritative pending check; never skip it.
- `_requestTypes` is deleted on reveal (`GameLogic.sol:421`), so type MUST come from the
  request events, never from chain state.
- Keep the keeper state in memory only. Backfill on boot replaces persistence.

### Local-dev entropy provider emulation

On a local Hardhat chain the Entropy contract is `MockEntropy` (see
`contracts/ethereum/test/CryptoPetsV2.test.ts:17-18`) and nothing auto-reveals. Behind a
separate env flag (`KEEPER_MOCK_REVEAL=true`, default false, refuse if chainId is not the local
one), the keeper also acts as the provider: on each tracked request event, call
`entropy.mockReveal(...)` with `crypto.randomBytes(32)`. Check `MockEntropy`'s exact function
signature in `node_modules/@pythnetwork/entropy-sdk-solidity` and mirror how
`CryptoPetsV2.test.ts` calls it. This replaces the old removed `vrf-fulfill-watcher.ts` role
for local dev.

### Config (extend `backend/src/config/env.ts`, following its existing pattern)

```
KEEPER_ENABLED        default false; when false, server starts exactly as today
KEEPER_RPC_URL        websocket or http RPC
KEEPER_PRIVATE_KEY    hot wallet key; REQUIRED when KEEPER_ENABLED
KEEPER_CHAIN_ID
KEEPER_GAME_LOGIC_ADDRESS
KEEPER_BACKFILL_BLOCKS   default 5000
KEEPER_MOCK_REVEAL       default false (local dev only)
```

Add all of these to `backend/env.example` with comments. Never log the private key.

### Frontend change (in `shared`, same phase)

In `shared/src/hooks/chains/ethereum/useEvmBattleFlow.ts`:

1. `handleFulfilled` (lines 73-86) no longer sends `settleBattle` immediately. Instead set a
   new phase `'awaiting-settle'` and start a 45s timer (store the timeout in a ref; clear it in
   `reset` and when `BattleResolved` arrives).
2. If the timer fires with no `BattleResolved`, THEN send the existing `settle.writeContract`
   call unchanged (same args, same `EVM_GAS_LIMITS.settleBattle`). This is the keeper-outage
   fallback; the user sees a wallet prompt only in that degraded case.
3. Add `'awaiting-settle'` to `EvmBattlePhase` in `shared/src/types/battle.ts` and map it in
   `frontend/src/hooks/battle/useBattlePanel.ts` (`preResultStatus` chain, around line 376) to
   a label like `'Waiting for the arena to settle...'`.
4. The manual recovery UI (`usePendingBattle`'s `settle`) stays untouched; it is the
   second-layer fallback.

### Verification

```bash
pnpm --filter backend test          # add vitest unit tests for requests.ts decoding + pendingSet logic
pnpm --filter backend build
pnpm --filter @shared/core test
pnpm --filter @shared/core lint
pnpm --filter frontend lint:check
```

Manual E2E on local stack: `pnpm eth:node`, deploy (`pnpm --prefix contracts/ethereum deploy`),
start backend with `KEEPER_ENABLED=true KEEPER_MOCK_REVEAL=true`, `pnpm dev:fe`; run a battle
and confirm exactly ONE wallet prompt, then `BattleResolved` arrives via the keeper. Then kill
the backend mid-battle and confirm the frontend fallback settles after 45s.

Definition of done: E2E passes both with and without the keeper running; no second wallet
prompt in the normal path; backend unit tests green.

---

## Phase 3 - shared: TypeScript combat sim port + golden vectors

Package: `shared` / `@shared/core` (PolyForm NC). Branch: `feat/realtime-battle-p3-sim-port`.

### Reference implementation

Port from Go, file for file: `indexer-go/internal/combat/`. The Go code is the cleanest
reference (pure functions, commented against the Solidity). Keep names aligned:

```
shared/src/utils/combat/
    dna.ts       digitPair, extract (DNA -> 5 attrs + element), elementMod   <- dna.go
    rng.ts       roundSeed, strikeRoll, beBytesMod                            <- rng.go
    skills.ts    skill index constants, SkillConfig type, defaultSkillConfig  <- skills.go
    strike.ts    strike, addHeal                                              <- strike.go
    sim.ts       simulate                                                     <- sim.go
    index.ts     public exports
    __tests__/goldenVectors.test.ts
```

Rules for the port:
- ALL arithmetic in `bigint` (rule 7 at the top; DNA overflows `number`).
- keccak256 via `viem` (already a dependency of `@shared/core`): `keccak256(concatBytes(...))`
  with `numberToBytes(seed, { size: 32 })` for the 32-byte big-endian seed, exactly matching
  `rng.go`'s `[32]byte` preimages: `roundSeed = keccak256(seed32 ++ uint8(round))`,
  `strikeRoll = uint256(keccak256(roundSeed32 ++ uint8(slotOffset))) % 10000n`. viem's keccak256
  is legacy Keccak-256 (Ethereum's), which is the required variant; NOT SHA3-256.
- Do not "improve" the math. `dmg == 0 -> 1` appears twice in `strike.go` on purpose; the tie
  rule is `bpsA > bpsB` (exact tie means pet 2 wins); rounds cap at 30; heal caps at startHp.
  Every such quirk is consensus-critical.
- Skill values outside 0..7 (the vectors use 99) must fall through every skill branch, which
  happens naturally with exact `===` comparisons per archetype.

### One deliberate addition: the strike log

The animation needs per-strike data that no other port produces. `simulate` returns
`{ result, log }` where `result` is `{ firstWins, rounds, winnerHpRemaining }` (identical
semantics to Go's `Result`) and `log` is:

```ts
interface StrikeLogEntry {
    round: number;          // 0-based
    attacker: 1 | 2;
    isMagic: boolean;
    crit: boolean;
    damage: bigint;
    heal: bigint;           // Bloodlust lifesteal, 0n otherwise
    elementMult: number;    // 85 | 100 | 115 (after Sage override)
    furyTriggered: boolean;
    rebirthTriggered: boolean; // defender survived at 1 HP this strike
    hp1After: bigint;
    hp2After: bigint;
}
```

There must be exactly ONE simulation code path: the log is recorded inline inside the single
`simulate`/`strike` implementation (a push into an array), never a second "with log" variant.
If the log ever influenced math, the golden vectors would catch nothing while the animation
lied; recording must be write-only.

### Golden-vector test

`contracts/test-vectors/battle.json` shape (verified):

```json
{
  "description": "...",
  "skillConfig": { "tankHpMult": 120, "shellDefMult": 125, ... },
  "cases": [
    { "name": "baseline-no-skill",
      "dna1": "1234567890123456", "rarity1": 1, "level1": 20, "skill1": 99,
      "dna2": "...", "rarity2": 1, "level2": 20, "skill2": 99,
      "seed": "1",
      "expected": { "firstWins": false, "rounds": 6, "winnerHpRemaining": 174 } }
  ]
}
```

The test imports it with a relative path
(`../../../../../contracts/test-vectors/battle.json`; check `shared/tsconfig` allows
`resolveJsonModule`, or read it with `fs.readFileSync` + `JSON.parse`, which avoids tsconfig
changes). `dna*` and `seed` are strings; convert with `BigInt(...)`. Use the file's own
`skillConfig` object, not `defaultSkillConfig`, so a future vector regeneration with different
balance values keeps the suite honest. Every case must pass all three expected fields. Also
assert internal consistency once per case: replaying `log` (summing damage/heals from full HP)
reproduces `result`.

### Verification

```bash
pnpm --filter @shared/core test    # golden vectors + any unit tests
pnpm --filter @shared/core lint
```

Definition of done: every vector case passes; the log-replay consistency assertion passes; no
edits outside `shared/src/utils/combat/` (plus exports in `shared`'s index if it has one).

---

## Phase 4 - live animation + reconciliation UX

Packages: `shared` + `frontend` (PolyForm NC). Branch: `feat/realtime-battle-p4-live-replay`.
Requires Phases 1, 2, 3 deployed/merged.

### Data source for the sim inputs

Because Phase 1 snapshots inputs at request time, the client reads the SNAPSHOT, not live pets:

1. Add a public getter to GameLogic if none exists for `_battleRequests` (check first; the
   mapping is private). Smallest change, done in Phase 1 if foreseen, else as a tiny follow-up
   upgrade: `function getBattleRequest(uint256 requestId) external view returns (PendingBattle memory)`.
2. On the frontend, when the requestId is known (`useEvmBattleFlow` step 1), read
   `getBattleRequest(requestId)` plus `gameConfig.getSkillConfig()` once (wagmi
   `useReadContracts` multicall). skill = `speciesId % 8` (mirrors `GameLogic.sol:208-209`).
3. Extend `useWatchEntropyFulfillment` to pass `randomNumber` through:
   `onFulfilled?: (requestId: bigint, randomNumber: `0x${string}`) => void`. The value is
   already in the decoded log args; it is currently ignored. Update the one existing caller.

### New hook: `shared/src/hooks/chains/ethereum/useLiveBattleReplay.ts`

```
inputs:  requestId, snapshot (from getBattleRequest), skillConfig, randomNumber
output:  { log: StrikeLogEntry[] | null, localResult: Result | null }
```

Pure composition: when all inputs are present, run `simulate` from Phase 3 once (memoized on
requestId) and expose the log. No effects beyond memoization.

### Overlay changes (frontend)

New part `frontend/src/components/pet/interactions/panels/battle/parts/battle-live-rounds.tsx`
rendered by `battle-overlay` between the taunts phase and the result card:

- Plays `log` entries sequentially (600-900ms per strike; both pets' HP bars animate from the
  `hp1After`/`hp2After` fields; crits/element advantage/skill procs get short text flourishes).
- The final winner card renders ONLY from the `BattleResolvedResult` event data
  (winner, `xpWin`, `xpLoss`, `winnerHpRemaining`), gated on BOTH the event having arrived AND
  the animation having finished. Both orderings occur; handle both.
- If the animation finishes first: show a `Finalizing on-chain...` line until the event lands
  (the Phase 2 fallback timer bounds this wait).
- Mismatch path (event disagrees with `localResult`): stop playback at the current entry, show
  a one-line interstitial (`The on-chain referee ruled differently - syncing the true
  result...`), then the normal result card built from the event with a small
  `corrected from chain` note and the tx link. Do not fabricate extra rounds.
- Keep CSS in a module per the frontend's naming convention (`lint:css` enforces it).

Wire-up in `frontend/src/hooks/battle/useBattlePanel.ts`: thread the new hook's output into
`BattleOverlayProps`; the existing `handleSuccess`/`outcome` flow stays as the authoritative
result input. The roster `refetch()` in `handleSuccess` must not visually disturb the running
animation (it updates other panels; the overlay reads only its own props - verify, don't
assume).

### Divergence telemetry (small, last)

On mismatch, `console.error` a structured object (requestId, snapshot inputs, skillConfig,
seed, localResult, on-chain result). Optionally POST it to a new backend route
`POST /api/telemetry/battle-divergence` (a thin `backend/src/features/telemetry/` route that
logs server-side; no DB). Mark the POST as optional; the console.error is required.

### Verification

```bash
pnpm --filter @shared/core test && pnpm --filter @shared/core lint
pnpm --filter frontend test
pnpm --filter frontend lint:check
pnpm --filter frontend build
```

Manual E2E (local stack as in Phase 2): run a battle; confirm the fight animates strike by
strike immediately after reveal, one wallet prompt total, and the result card matches the
`BattleResolved` event. Force the mismatch path once in dev by intentionally feeding the sim a
wrong level via a temporary hack, confirm the interstitial + corrected card, then remove the
hack.

Definition of done: E2E as above; all listed commands green.

---

## Phase 5 - docs and guardrails

Branch: `feat/realtime-battle-p5-docs`. After everything above is merged.

1. `AGENTS.md`: the combat-simulator non-negotiable changes from three ports to four - add
   `shared/src/utils/combat/` to the MUST-update-together list and the golden-vector
   enforcement list (vitest suite).
2. `CLAUDE.md`: same update in the "Combat simulator is ported three times" section (now four),
   plus a one-line mention of the settle keeper under the backend component row and its env
   flags.
3. `docs/testing.md`: add the `shared` golden-vector suite to the suite table.
4. `backend/README.md` or `backend/API.md`: document the keeper env vars and the telemetry
   route if it was added.

Definition of done: docs match reality; no stale references to the frontend sending
`settleBattle` in the normal path.

---

## Acceptance summary (whole feature)

| # | Criterion | Verified by |
| --- | --- | --- |
| 1 | One wallet signature per battle in the normal path | Phase 2 E2E |
| 2 | Keeper outage degrades to the old flow, never strands a battle | Phase 2 E2E (kill keeper) |
| 3 | Battle inputs immutable after request (no train-front-run reroll) | Phase 1 test `snapshot freezes battle inputs` |
| 4 | TS sim bit-identical to the other three ports | Phase 3 golden vectors |
| 5 | Fight animates live from the reveal, before settle is mined | Phase 4 E2E |
| 6 | Result card only ever shows the on-chain outcome | Phase 4 mismatch test |
| 7 | Four-port obligation documented | Phase 5 |
