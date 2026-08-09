import type { Abi } from 'viem';
import petCoreAbi from '@chains/ethereum/petCoreAbi.json';
import gameLogicAbi from '@chains/ethereum/gameLogicAbi.json';
import gameConfigAbi from '@chains/ethereum/gameConfigAbi.json';
import itemCoreAbi from '@chains/ethereum/itemCoreAbi.json';

/**
 * v2 EVM contract surface. The monolithic v1 contract is split into three units, with a
 * fourth added for inventory:
 *  - PetCore (proxy)   — ERC-721 storage, mint, rename, level/XP, cooldowns, marriage.
 *  - GameLogic (proxy) — async breed/mint (request → settle) + entropy wiring.
 *  - GameConfig        — tunable fees / cooldowns / XP-curve / skill params (read for UI).
 *  - ItemCore (proxy)  — ERC-1155 inventory: balances, and the equip/unequip the player
 *                        signs themselves (roadmap §4). Optional; see below.
 *
 * CombatSim is deliberately absent: battles are resolved by the backend and replayed
 * from the signed receipt (§L Phase 6), so no client ever calls the on-chain sim.
 *
 * Addresses come from env (per-deployment) and fall back to the current
 * Sepolia (chain 11155111) deployment so local dev works out of the box.
 * See `contracts/ethereum/ignition/deployments/chain-11155111/deployed_addresses.json`.
 * ItemCore is the exception: it has no Sepolia deployment to fall back to, so it is
 * undefined until its env var is set.
 */
const SEPOLIA_PETCORE = '0xD94B02fC6238AcE5c0Fd767bFf8f5A1FCD9B59DB';
const SEPOLIA_GAMELOGIC = '0x87E3E1e3EB22eC45fB99715BdF91911697997Be4';
const SEPOLIA_GAMECONFIG = '0xE16e0e982D390C4F826D00Fc0E771846a002F10B';

interface EvmContract {
    address: `0x${string}`;
    abi: Abi;
}

const petCoreContract: EvmContract = {
    address: (import.meta.env.VITE_PETCORE_ADDRESS || SEPOLIA_PETCORE) as `0x${string}`,
    abi: petCoreAbi.abi as Abi,
};

const gameLogicContract: EvmContract = {
    address: (import.meta.env.VITE_GAMELOGIC_ADDRESS || SEPOLIA_GAMELOGIC) as `0x${string}`,
    abi: gameLogicAbi.abi as Abi,
};

const gameConfigContract: EvmContract = {
    address: (import.meta.env.VITE_GAMECONFIG_ADDRESS || SEPOLIA_GAMECONFIG) as `0x${string}`,
    abi: gameConfigAbi.abi as Abi,
};

/**
 * ItemCore (roadmap §4). Unlike the three above it has no fallback address, because it has
 * no Sepolia deployment to fall back to — it is new. Undefined without the env var, which
 * the inventory adapter reads as "this deployment cannot equip" and surfaces as a disabled
 * control rather than a button that reverts.
 */
const itemCoreAddress = import.meta.env.VITE_ITEMCORE_ADDRESS as `0x${string}` | undefined;
const itemCoreContract: EvmContract | undefined = itemCoreAddress
    ? { address: itemCoreAddress, abi: itemCoreAbi.abi as Abi }
    : undefined;

export const evmContracts = {
    petCore: petCoreContract,
    gameLogic: gameLogicContract,
    gameConfig: gameConfigContract,
    itemCore: itemCoreContract,
} as const;
