import type { Abi } from 'viem';
import petCoreAbi from '@chains/ethereum/petCoreAbi.json';
import gameLogicAbi from '@chains/ethereum/gameLogicAbi.json';
import gameConfigAbi from '@chains/ethereum/gameConfigAbi.json';
import combatSimAbi from '@chains/ethereum/combatSimAbi.json';

/**
 * v2 EVM contract surface. The monolithic v1 contract is split into four units:
 *  - PetCore (proxy)   — ERC-721 storage, mint, rename, level/XP, cooldowns, marriage.
 *  - GameLogic (proxy) — async battle/breed/train (request → settle) + VRF wiring.
 *  - GameConfig        — tunable fees / cooldowns / XP-curve / skill params (read for UI).
 *  - CombatSim         — pure `simulate(...)` combat lib (client-side pre-fight estimates).
 *
 * Addresses come from env (per-deployment) and fall back to the current
 * Sepolia (chain 11155111) deployment so local dev works out of the box.
 * See `contracts/ethereum/ignition/deployments/chain-11155111/deployed_addresses.json`.
 */
const SEPOLIA_PETCORE = '0xd30D9Cf66079774b5A41Cc69af44D890b942FbE2';
const SEPOLIA_GAMELOGIC = '0x7C9f4634142a43633F3a1104733Cc4f0d0a21Aa3';
const SEPOLIA_GAMECONFIG = '0xcbf789aae13BbF971e1aD2532f236E77a8CaE735';
const SEPOLIA_COMBATSIM = '0x101FaF23889C2aE39d76A6257e372e3983e1F3E7';

export interface EvmContract {
    address: `0x${string}`;
    abi: Abi;
}

export const petCoreContract: EvmContract = {
    address: (import.meta.env.VITE_PETCORE_ADDRESS || SEPOLIA_PETCORE) as `0x${string}`,
    abi: petCoreAbi.abi as Abi,
};

export const gameLogicContract: EvmContract = {
    address: (import.meta.env.VITE_GAMELOGIC_ADDRESS || SEPOLIA_GAMELOGIC) as `0x${string}`,
    abi: gameLogicAbi.abi as Abi,
};

export const gameConfigContract: EvmContract = {
    address: (import.meta.env.VITE_GAMECONFIG_ADDRESS || SEPOLIA_GAMECONFIG) as `0x${string}`,
    abi: gameConfigAbi.abi as Abi,
};

export const combatSimContract: EvmContract = {
    address: (import.meta.env.VITE_COMBATSIM_ADDRESS || SEPOLIA_COMBATSIM) as `0x${string}`,
    abi: combatSimAbi.abi as Abi,
};

export const evmContracts = {
    petCore: petCoreContract,
    gameLogic: gameLogicContract,
    gameConfig: gameConfigContract,
    combatSim: combatSimContract,
} as const;
