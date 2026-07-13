import type { PetsEvmConfig } from '@shared/core';
import { evmContracts } from '@chains/ethereum/contracts';

const evmChainId = import.meta.env.VITE_EVM_CHAIN_ID
    ? Number(import.meta.env.VITE_EVM_CHAIN_ID)
    : undefined;

/** Backend's live-battle-socket WS endpoint, derived from VITE_API_URL (http(s) -> ws(s)).
 *  Undefined if VITE_API_URL isn't set — useEvmBattleFlow degrades to local-only sim. */
const liveBattleWsUrl = import.meta.env.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL.replace(/^http/, 'ws')}/ws/live-battle`
    : undefined;

/** v2 EVM contract config for `PetsConfigProvider` from `@shared/core`. */
export const petsContractParams: PetsEvmConfig = {
    petCore: evmContracts.petCore,
    gameLogic: evmContracts.gameLogic,
    gameConfig: evmContracts.gameConfig,
    combatSim: evmContracts.combatSim,
    enabled: true,
    chainId: evmChainId,
    liveBattleWsUrl,
};
