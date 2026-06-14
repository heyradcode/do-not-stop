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
const SEPOLIA_PETCORE = '0x0BB0e03259Cf9DA7B0A3e258e2D17d68D7be9d33';
const SEPOLIA_GAMELOGIC = '0xaDEC55D3b9B2517D37C4bAbbb0dDc9F34de256ee';
const SEPOLIA_GAMECONFIG = '0xc8acCDc7D20B85326D586A7Fc861453E6550cCef';
const SEPOLIA_COMBATSIM = '0xca8Cb84D8e7619e783A2e546715BBe948E169C45';

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
