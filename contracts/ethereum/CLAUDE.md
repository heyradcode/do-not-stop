# contracts/ethereum

Moved out of the root `CLAUDE.md` so it loads only when working in this directory.
Universal rules and the cross-chain non-negotiables stay in the root file and `AGENTS.md`.

## Hardhat specifics worth knowing
- Contract sources live in `contracts/ethereum/src/` (not `contracts/`): `PetCore.sol`, `GameLogic.sol`, `GameConfig.sol`, `DnaLib.sol`, `TestDeployer.sol`, plus `BattleBatchRegistry.sol` / `SeasonRewardDistributor.sol` for the backend-battle anchor and rewards, and `ItemCore.sol` for inventory (§4).
- `@openzeppelin/contracts-upgradeable` is pinned to **4.7.3** while `@openzeppelin/contracts` is `^5.4.0`. A new upgradeable contract uses the 4.x initializer style (`__ERC1155_init`), not v5's `_update` hook — `ItemCore.sol` is the worked example.
- `scripts/deploy.ts` has **no `localhost` network** (see `scripts/networks.ts`), so the documented local path does not run. To deploy locally, start `pnpm hh node`, deploy `MockEntropy`, write an `ignition/parameters/.runtime-localhost.json` naming it, and call `pnpm hh ignition deploy ignition/modules/CryptoPetsV2Live.ts --network localhost --parameters <file> --deployment-id <name>` directly.
- Both compiler profiles (`default` and `production`) are pinned to `viaIR` explicitly, because Hardhat Ignition silently drops viaIR/optimizer settings from a flat config and the two profiles must match. `CombatSim.sol`'s "stack too deep" was the original reason; with it deleted the remaining sources compile without viaIR, so the setting is now an optimizer choice rather than a requirement.
- The `localhost` network hardcodes the 5 standard Hardhat dev private keys; only live networks (Sepolia, Base Sepolia, see `scripts/networks.ts`) read `PRIVATE_KEY` from env.
- Deployment is Hardhat Ignition-based (`ignition/modules/CryptoPetsV2Live.ts`); use `pnpm --prefix contracts/ethereum deploy:status` / `deploy:visualize` to inspect.
