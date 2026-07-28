# Contract layout & naming

Two generations of contracts live in this package. See
`contracts/plan-contract-upgrade.md` for the full design.

## v2 architecture (current) — `src/`

| File | Role |
| --- | --- |
| `PetCore.sol` | UUPS proxy implementation: ERC-721 + pet storage (DNA, stats, lineage, cooldowns) + marriage records |
| `GameLogic.sol` | UUPS proxy implementation: breed/mint/train mechanics, Pyth Entropy request → store → settle |
| `GameConfig.sol` | Plain (non-proxy) contract holding every tunable; swap by deploying a new one and re-pointing |
| `CombatSim.sol` | Stateless pure combat simulator. **Frozen and no longer deployed** (§L Phase 6): nothing on chain calls it, and it stays only as the Solidity leg of the golden-vector parity check, which deploys it per test run |
| `DnaLib.sol` | Internal library: DNA → attributes/rarity/element derivation (must stay bit-identical with Solana) |
| `TestDeployer.sol` | Single-tx local deployer for the proxy stack (tests only) |

**Why the `V1` suffix on v2-architecture contracts?** It versions the
*implementation behind the proxy*, not the game. The first upgrade deploys a
`PetCoreV2` implementation into the same `PetCoreProxy`. This follows the
plan's own naming (§2.1).

Battles no longer settle on chain at all (§L Phase 6). `GameLogic` keeps its
retired battle storage slots declared but unused, because it sits behind a proxy
and deleting a slot re-lays out everything after it; `PetCore.Pet` keeps
`winCount`/`lossCount`/`lastOpponentId`/`sameOpponentStreak` for the same reason.
Read those as a frozen record of whatever the last on-chain battle left behind.
