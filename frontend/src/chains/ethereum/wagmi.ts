import { http } from 'viem';
import { createConfig } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { CHAINS } from '@constants/chains';

const allChains = CHAINS.map((chainConfig) => chainConfig.chain);

/**
 * Wagmi config for the app: every chain from `constants/chains/ethereum.ts`
 * with the injected (browser wallet) connector and an `http` transport per chain.
 */
export const wagmiConfig = createConfig({
    chains: allChains as any,
    connectors: [injected()],
    multiInjectedProviderDiscovery: false,
    transports: Object.fromEntries(
        allChains.map((chain) => [chain.id, http(chain.rpcUrls.default.http[0])])
    ),
});
