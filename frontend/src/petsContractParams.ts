import type { PetsEvmConfig } from '@shared/core';
import { evmContracts } from '@chains/ethereum/contracts';

const evmChainId = import.meta.env.VITE_EVM_CHAIN_ID
    ? Number(import.meta.env.VITE_EVM_CHAIN_ID)
    : undefined;

/** v2 EVM contract config for `PetsConfigProvider` from `@shared/core`. */
export const petsContractParams: PetsEvmConfig = {
    petCore: evmContracts.petCore,
    gameLogic: evmContracts.gameLogic,
    gameConfig: evmContracts.gameConfig,
    enabled: true,
    chainId: evmChainId,
};
