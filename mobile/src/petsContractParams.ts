import { useMemo } from 'react';
import { useAccount } from 'wagmi';
import type { PetsEvmConfig } from '@shared/core';

import { evmContractsFor, hasEvmDeployment } from './chains/ethereum/contracts';
import { TARGET_CHAIN_ID } from './constants/ethereumNetworks';

/**
 * v2 EVM contract config for `PetsConfigProvider` from `@shared/core`, mirroring
 * `frontend/src/petsContractParams.ts`.
 *
 * `chainId` is always set here, where frontend leaves it `undefined` when its env
 * var is absent. `TARGET_CHAIN_ID` already resolves its own fallback, so read
 * hooks get an explicit chain to target.
 */
export const petsContractParams: PetsEvmConfig = {
    ...evmContractsFor(TARGET_CHAIN_ID),
    enabled: true,
    chainId: TARGET_CHAIN_ID,
};

/**
 * The config for whichever deployment chain the wallet is currently on.
 *
 * `PetsEvmConfig.chainId` pins reads to one chain regardless of where the wallet
 * sits, which is right for a single-deployment build and wrong once there are
 * two: a static config would keep reading the target chain's proxy while the
 * player is on the other one, returning that chain's pets under this chain's
 * balances. Following the wallet is what makes switching networks mean anything.
 *
 * Falls back to the target when the wallet is on a chain with no deployment, so
 * the gate has something coherent to render behind it rather than an empty
 * config.
 */
export function useEvmPetsConfig(): PetsEvmConfig {
    const { chainId } = useAccount();

    return useMemo(() => {
        const resolved = chainId !== undefined && hasEvmDeployment(chainId) ? chainId : TARGET_CHAIN_ID;
        return {
            ...evmContractsFor(resolved),
            enabled: true,
            chainId: resolved,
        };
    }, [chainId]);
}
