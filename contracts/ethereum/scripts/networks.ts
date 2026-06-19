/**
 * Registry of EVM networks where CryptoPets can be deployed.
 *
 * Limited to chains supported by Pyth Entropy V2:
 *   https://docs.pyth.network/entropy/contract-addresses
 *
 * For each network, set these env vars in contracts/ethereum/.env:
 *   <PREFIX>_RPC_URL
 *   <PREFIX>_ENTROPY_ADDRESS   (optional if `defaultEntropyAddress` is set below)
 *
 * Plus the shared:
 *   PRIVATE_KEY
 *   ETHERSCAN_API_KEY               (for verification)
 */

export interface NetworkSpec {
    /** Hardhat network name (kebab-case). Used as the `--network` flag value. */
    name: string;
    /** Prefix for per-network env vars (UPPER_SNAKE_CASE). */
    envPrefix: string;
    /** EVM chain id. Used to locate `ignition/deployments/chain-<chainId>/`. */
    chainId: number;
    /** Pyth Entropy V2 contract address for this network. If unset, env override is required. */
    defaultEntropyAddress?: `0x${string}`;
}

export const NETWORKS: NetworkSpec[] = [
    {
        name: "sepolia",
        envPrefix: "SEPOLIA",
        chainId: 11155111,
        // Pyth Entropy V2 on Sepolia — verify at https://docs.pyth.network/entropy/chainlist
        defaultEntropyAddress: "0x41c9e39574f40ad34c79f1c99b66a45efb830d4c",
    },
    { name: "mainnet", envPrefix: "MAINNET", chainId: 1 },
    { name: "bsc", envPrefix: "BSC", chainId: 56 },
    { name: "bsc-testnet", envPrefix: "BSC_TESTNET", chainId: 97 },
    { name: "polygon", envPrefix: "POLYGON", chainId: 137 },
    { name: "polygon-amoy", envPrefix: "POLYGON_AMOY", chainId: 80002 },
    { name: "avalanche", envPrefix: "AVALANCHE", chainId: 43114 },
    { name: "avalanche-fuji", envPrefix: "AVALANCHE_FUJI", chainId: 43113 },
    { name: "arbitrum", envPrefix: "ARBITRUM", chainId: 42161 },
    { name: "arbitrum-sepolia", envPrefix: "ARBITRUM_SEPOLIA", chainId: 421614 },
    { name: "optimism", envPrefix: "OPTIMISM", chainId: 10 },
    { name: "optimism-sepolia", envPrefix: "OPTIMISM_SEPOLIA", chainId: 11155420 },
    { name: "base", envPrefix: "BASE", chainId: 8453 },
    {
        name: "base-sepolia",
        envPrefix: "BASE_SEPOLIA",
        chainId: 84532,
        // Pyth Entropy V2 on Base Sepolia — verify at https://docs.pyth.network/entropy/chainlist
        // defaultEntropyAddress: "0x...",  // set BASE_SEPOLIA_ENTROPY_ADDRESS in .env until confirmed
    },
];

export function getNetwork(name: string): NetworkSpec | undefined {
    return NETWORKS.find((n) => n.name === name);
}

export interface ResolvedEntropyParams {
    entropyAddress: `0x${string}`;
}

/**
 * Reads the Pyth Entropy address for `network` from env, falling back to the
 * registry default. Throws a clear error (with a docs link) on missing values.
 */
export function resolveEntropyParams(
    network: NetworkSpec,
    env: NodeJS.ProcessEnv = process.env
): ResolvedEntropyParams {
    const p = network.envPrefix;

    const entropyAddress = (env[`${p}_ENTROPY_ADDRESS`] ??
        network.defaultEntropyAddress) as `0x${string}` | undefined;

    if (!entropyAddress) {
        throw new Error(
            `Missing Pyth Entropy address for network "${network.name}". ` +
            `Set ${p}_ENTROPY_ADDRESS in contracts/ethereum/.env, or add a ` +
            `defaultEntropyAddress to this network in scripts/networks.ts.\n` +
            `Find the address at https://docs.pyth.network/entropy/contract-addresses`
        );
    }

    return { entropyAddress };
}

/**
 * Resolves the RPC URL for `network` from env. Falls back to legacy `SEPOLIA_URL`
 * for Sepolia so existing .env files keep working.
 */
export function resolveRpcUrl(
    network: NetworkSpec,
    env: NodeJS.ProcessEnv = process.env
): string | undefined {
    const v = env[`${network.envPrefix}_RPC_URL`];
    if (v) return v;
    if (network.name === "sepolia" && env.SEPOLIA_URL) return env.SEPOLIA_URL;
    return undefined;
}
