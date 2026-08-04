import type { Abi } from 'viem';
import petCoreAbi from '@chains/ethereum/petCoreAbi.json';
import gameLogicAbi from '@chains/ethereum/gameLogicAbi.json';
import gameConfigAbi from '@chains/ethereum/gameConfigAbi.json';

/**
 * v2 EVM contract surface. The monolithic v1 contract is split into three units:
 *  - PetCore (proxy)   — ERC-721 storage, mint, rename, level/XP, cooldowns, marriage.
 *  - GameLogic (proxy) — async breed/mint (request → settle) + entropy wiring.
 *  - GameConfig        — tunable fees / cooldowns / XP-curve / skill params (read for UI).
 *
 * CombatSim is deliberately absent: battles are resolved by the backend and replayed
 * from the signed receipt (§L Phase 6), so no client ever calls the on-chain sim.
 *
 * Addresses come from env (per-deployment) and fall back to the current
 * Sepolia (chain 11155111) deployment so local dev works out of the box.
 * See `contracts/ethereum/ignition/deployments/chain-11155111/deployed_addresses.json`.
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

export const evmContracts = {
    petCore: petCoreContract,
    gameLogic: gameLogicContract,
    gameConfig: gameConfigContract,
} as const;
