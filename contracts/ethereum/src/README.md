# Contract layout & naming

Two generations of contracts live in this package. See
`contracts/plan-contract-upgrade.md` for the full design.

## v2 architecture (current) — `src/`

| File | Role |
| --- | --- |
| `PetCoreV1.sol` | UUPS proxy implementation: ERC-721 + pet storage (DNA, stats, lineage, cooldowns) + marriage records |
| `GameLogicV1.sol` | UUPS proxy implementation: battle/breed/train mechanics, VRF request → store → settle |
| `GameConfig.sol` | Plain (non-proxy) contract holding every tunable; swap by deploying a new one and re-pointing |
| `CombatSimV1.sol` | Stateless pure combat simulator; balance patches deploy `CombatSimV2` and call `GameConfig.setCombatSim` |
| `DnaLib.sol` | Internal library: DNA → attributes/rarity/element derivation (must stay bit-identical with Solana) |
| `LocalCryptoPetsDeployerV2.sol` | Single-tx local deployer for the proxy stack (tests only) |

**Why the `V1` suffix on v2-architecture contracts?** It versions the
*implementation behind the proxy*, not the game. The first upgrade deploys a
`PetCoreV2` implementation into the same `PetCoreProxy`; old `CombatSimV1`
stays on-chain so historical battles remain replayable. This follows the
plan's own naming (§2.1).

## Legacy v1 stack (deprecated) — `src/legacy/`

`CryptoPets.sol` (facade) + `Inventory.sol`, `Battle.sol`, `Breeding.sol`,
`Utils.sol`, deployed immutably via constructor `new` — the monolith the plan
replaces. Kept only while the frontend/subgraph still target the old
deployment (`scripts/sync-abi.js` still exports its ABI). Marked
`@custom:deprecated`; do not extend.
