import type { PetsEvmConfig } from '@shared/core';
import { evmContracts } from '@chains/ethereum/contracts';

/** v2 EVM contract config for `PetsConfigProvider` from `@shared/core`. */
export const petsContractParams: PetsEvmConfig = {
    petCore: evmContracts.petCore,
    gameLogic: evmContracts.gameLogic,
    gameConfig: evmContracts.gameConfig,
    combatSim: evmContracts.combatSim,
    enabled: true,
};
