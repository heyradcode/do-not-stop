import type { PetsEvmConfig } from '@shared/core';

import { evmContracts } from './chains/ethereum/contracts';
import { TARGET_CHAIN_ID } from './constants/ethereumNetworks';

/**
 * v2 EVM contract config for `PetsConfigProvider` from `@shared/core`, mirroring
 * `frontend/src/petsContractParams.ts`.
 *
 * `chainId` is always set here, where frontend leaves it `undefined` when its env
 * var is absent. `TARGET_CHAIN_ID` already resolves its own fallback, so read
 * hooks get an explicit chain to target regardless of which one the wallet is on.
 */
export const petsContractParams: PetsEvmConfig = {
    petCore: evmContracts.petCore,
    gameLogic: evmContracts.gameLogic,
    gameConfig: evmContracts.gameConfig,
    enabled: true,
    chainId: TARGET_CHAIN_ID,
};
