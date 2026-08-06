import type { Abi } from 'viem';
import { baseSepolia, sepolia } from 'wagmi/chains';
import { PETCORE_ADDRESS, GAMELOGIC_ADDRESS, GAMECONFIG_ADDRESS } from '@env';

import { TARGET_CHAIN_ID } from '../../constants/ethereumNetworks';
import petCoreAbi from './petCoreAbi.json';
import gameLogicAbi from './gameLogicAbi.json';
import gameConfigAbi from './gameConfigAbi.json';

/**
 * v2 EVM contract surface, mirroring `frontend/src/chains/ethereum/contracts.ts`.
 * The monolithic v1 contract is split into three units:
 *  - PetCore (proxy)   - ERC-721 storage, mint, rename, level/XP, cooldowns, marriage.
 *  - GameLogic (proxy) - async breed/mint (request then settle) + entropy wiring.
 *  - GameConfig        - tunable fees / cooldowns / XP-curve / skill params (read for UI).
 *
 * CombatSim is deliberately absent: battles are resolved by the backend and replayed
 * from the signed receipt (§L Phase 6), so no client ever calls the on-chain sim.
 *
 * The ABI JSONs are copied verbatim from frontend rather than regenerated, so the
 * two apps decode identical call data. All deployments share them: the proxies
 * differ per chain, the interface does not.
 *
 * **Addresses are keyed by chain**, because the app is playable on more than one.
 * A single set would send reads for whichever chain the wallet is on to the other
 * chain's proxy, which is how the frontend ended up querying Sepolia addresses on
 * Base Sepolia and getting an empty `0x` that reads like a decode bug.
 */

/** Proxy addresses for one chain. Absent means "no deployment here yet". */
export interface EvmDeployment {
    petCore?: `0x${string}`;
    gameLogic?: `0x${string}`;
    gameConfig?: `0x${string}`;
}

/**
 * Sepolia (11155111), verified on-chain 2026-08-05: all three live, PetCore answers
 * name()="CryptoPets", GameLogic.petCore()/gameConfig() point back at the other two,
 * and GameLogic.entropy() resolves to Pyth Entropy V2.
 *
 * Not the older Sepolia stack at 0x0BB0e0…9d33 / 0xaDEC55…56ee, which holds 5 pets
 * but whose GameLogic predates the entropy wiring, so minting a starter reverts.
 * See `docs/plan-mobile-frontend-parity.md` Phase 0.1.
 */
const SEPOLIA: EvmDeployment = {
    petCore: '0xD94B02fC6238AcE5c0Fd767bFf8f5A1FCD9B59DB',
    gameLogic: '0x87E3E1e3EB22eC45fB99715BdF91911697997Be4',
    gameConfig: '0xE16e0e982D390C4F826D00Fc0E771846a002F10B',
};

/**
 * Base Sepolia (84532). Deliberately empty until the proxies exist.
 *
 * As of 2026-08-06 the deployment there is partial: GameConfig, both
 * implementations, BattleBatchRegistry and SeasonRewardDistributor are live, but
 * `PetCoreProxy` and `GameLogicProxy` were never created, and clients talk to the
 * proxies rather than the implementations. Filling these with the implementation
 * addresses would produce a contract with no storage and no pets, so they stay
 * absent and `hasEvmDeployment` reports false until the deploy completes.
 */
const BASE_SEPOLIA: EvmDeployment = {};

const DEPLOYMENTS: Record<number, EvmDeployment> = {
    [sepolia.id]: SEPOLIA,
    [baseSepolia.id]: BASE_SEPOLIA,
};

/**
 * `.env` overrides apply to the target chain only.
 *
 * The variables are chain-agnostic (`PETCORE_ADDRESS`, not `SEPOLIA_PETCORE_ADDRESS`),
 * so they can only mean one deployment. Letting them override every chain would
 * point both at the same proxy, which is the bug this module is keyed to avoid.
 */
const envOverrides: EvmDeployment = {
    petCore: (PETCORE_ADDRESS || undefined) as `0x${string}` | undefined,
    gameLogic: (GAMELOGIC_ADDRESS || undefined) as `0x${string}` | undefined,
    gameConfig: (GAMECONFIG_ADDRESS || undefined) as `0x${string}` | undefined,
};

export interface EvmContract {
    address?: `0x${string}`;
    abi: Abi;
}

export interface EvmContracts {
    petCore: EvmContract;
    gameLogic: EvmContract;
    gameConfig: EvmContract;
}

export function resolveEvmDeployment(chainId: number): EvmDeployment {
    const base = DEPLOYMENTS[chainId] ?? {};
    if (chainId !== TARGET_CHAIN_ID) return base;
    return {
        petCore: envOverrides.petCore ?? base.petCore,
        gameLogic: envOverrides.gameLogic ?? base.gameLogic,
        gameConfig: envOverrides.gameConfig ?? base.gameConfig,
    };
}

/**
 * True when a chain has the two contracts the app cannot work without.
 * GameConfig is read-only fee/cooldown display, so its absence degrades rather
 * than blocks.
 */
export function hasEvmDeployment(chainId: number): boolean {
    const d = resolveEvmDeployment(chainId);
    return Boolean(d.petCore && d.gameLogic);
}

/** Contract refs for one chain. Addresses may be undefined; reads stay disabled then. */
export function evmContractsFor(chainId: number): EvmContracts {
    const d = resolveEvmDeployment(chainId);
    return {
        petCore: { address: d.petCore, abi: petCoreAbi.abi as Abi },
        gameLogic: { address: d.gameLogic, abi: gameLogicAbi.abi as Abi },
        gameConfig: { address: d.gameConfig, abi: gameConfigAbi.abi as Abi },
    };
}

/** The target chain's contracts, for callers with no wallet context. */
export const evmContracts: EvmContracts = evmContractsFor(TARGET_CHAIN_ID);
