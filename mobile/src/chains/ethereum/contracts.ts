import type { Abi } from 'viem';
import { PETCORE_ADDRESS, GAMELOGIC_ADDRESS, GAMECONFIG_ADDRESS } from '@env';

import petCoreAbi from './petCoreAbi.json';
import gameLogicAbi from './gameLogicAbi.json';
import gameConfigAbi from './gameConfigAbi.json';

/**
 * v2 EVM contract surface, mirroring `frontend/src/chains/ethereum/contracts.ts`.
 * The monolithic v1 contract is split into three units:
 *  - PetCore (proxy)   — ERC-721 storage, mint, rename, level/XP, cooldowns, marriage.
 *  - GameLogic (proxy) — async breed/mint (request → settle) + entropy wiring.
 *  - GameConfig        — tunable fees / cooldowns / XP-curve / skill params (read for UI).
 *
 * CombatSim is deliberately absent: battles are resolved by the backend and replayed
 * from the signed receipt (§L Phase 6), so no client ever calls the on-chain sim.
 *
 * The ABI JSONs are copied verbatim from frontend rather than regenerated, so the
 * two apps decode identical call data.
 *
 * Addresses come from env and fall back to the same Sepolia (11155111) deployment
 * frontend defaults to. Verified on-chain 2026-08-05: all three are live, PetCore
 * answers name()="CryptoPets", GameLogic.petCore()/gameConfig() point back at the
 * other two, and GameLogic.entropy() resolves to Pyth Entropy V2.
 *
 * Not to be confused with the older Sepolia stack at 0x0BB0e0…9d33 / 0xaDEC55…56ee,
 * which holds 5 pets but whose GameLogic predates the entropy wiring, so minting a
 * starter reverts there. See `docs/plan-mobile-frontend-parity.md` Phase 0.1.
 */
const SEPOLIA_PETCORE = '0xD94B02fC6238AcE5c0Fd767bFf8f5A1FCD9B59DB';
const SEPOLIA_GAMELOGIC = '0x87E3E1e3EB22eC45fB99715BdF91911697997Be4';
const SEPOLIA_GAMECONFIG = '0xE16e0e982D390C4F826D00Fc0E771846a002F10B';

interface EvmContract {
    address: `0x${string}`;
    abi: Abi;
}

const petCoreContract: EvmContract = {
    address: (PETCORE_ADDRESS || SEPOLIA_PETCORE) as `0x${string}`,
    abi: petCoreAbi.abi as Abi,
};

const gameLogicContract: EvmContract = {
    address: (GAMELOGIC_ADDRESS || SEPOLIA_GAMELOGIC) as `0x${string}`,
    abi: gameLogicAbi.abi as Abi,
};

const gameConfigContract: EvmContract = {
    address: (GAMECONFIG_ADDRESS || SEPOLIA_GAMECONFIG) as `0x${string}`,
    abi: gameConfigAbi.abi as Abi,
};

export const evmContracts = {
    petCore: petCoreContract,
    gameLogic: gameLogicContract,
    gameConfig: gameConfigContract,
} as const;
