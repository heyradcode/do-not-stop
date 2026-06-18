# Contract layout & naming

Two generations of contracts live in this package. See
`contracts/plan-contract-upgrade.md` for the full design.

## v2 architecture (current) — `src/`

| File | Role |
| --- | --- |
| `PetCore.sol` | UUPS proxy implementation: ERC-721 + pet storage (DNA, stats, lineage, cooldowns) + marriage records |
| `GameLogic.sol` | UUPS proxy implementation: battle/breed/train mechanics, Pyth Entropy request → store → settle |
| `GameConfig.sol` | Plain (non-proxy) contract holding every tunable; swap by deploying a new one and re-pointing |
| `CombatSim.sol` | Stateless pure combat simulator; balance patches deploy `CombatSimV2` and call `GameConfig.setCombatSim` |
| `DnaLib.sol` | Internal library: DNA → attributes/rarity/element derivation (must stay bit-identical with Solana) |
| `TestDeployer.sol` | Single-tx local deployer for the proxy stack (tests only) |

**Why the `V1` suffix on v2-architecture contracts?** It versions the
*implementation behind the proxy*, not the game. The first upgrade deploys a
`PetCoreV2` implementation into the same `PetCoreProxy`; old `CombatSim`
stays on-chain so historical battles remain replayable. This follows the
plan's own naming (§2.1).
