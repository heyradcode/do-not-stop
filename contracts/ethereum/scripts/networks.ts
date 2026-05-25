/**
 * Registry of EVM networks where CryptoPets can be deployed.
 *
 * Limited to chains supported by Chainlink VRF v2.5:
 *   https://docs.chain.link/vrf/v2-5/supported-networks
 *
 * For each network, set these env vars in contracts/ethereum/.env:
 *   <PREFIX>_RPC_URL
 *   <PREFIX>_VRF_SUBSCRIPTION_ID
 *   <PREFIX>_VRF_COORDINATOR        (optional if `defaultVrfCoordinator` is set below)
 *   <PREFIX>_VRF_KEY_HASH           (optional if `defaultVrfKeyHash` is set below)
 *   <PREFIX>_VRF_NATIVE_PAYMENT     (optional, default false)
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
    /** Optional VRF coordinator default. If unset, env override is required. */
    defaultVrfCoordinator?: `0x${string}`;
    /** Optional VRF key hash default (gas lane). If unset, env override is required. */
    defaultVrfKeyHash?: `0x${string}`;
}

export const NETWORKS: NetworkSpec[] = [
    {
        name: "sepolia",
        envPrefix: "SEPOLIA",
        chainId: 11155111,
        defaultVrfCoordinator: "0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B",
        defaultVrfKeyHash:
            "0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae",
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
    { name: "base-sepolia", envPrefix: "BASE_SEPOLIA", chainId: 84532 },
];

export function getNetwork(name: string): NetworkSpec | undefined {
    return NETWORKS.find((n) => n.name === name);
}

export interface ResolvedVrfParams {
    vrfCoordinator: `0x${string}`;
    vrfKeyHash: `0x${string}`;
    vrfSubscriptionId: string;
    vrfNativePayment: boolean;
}

/**
 * Reads VRF parameters for `network` from env, falling back to registry defaults.
 * Throws a clear error (with a Chainlink docs link) on missing required values.
 */
export function resolveVrfParams(
    network: NetworkSpec,
    env: NodeJS.ProcessEnv = process.env
): ResolvedVrfParams {
    const p = network.envPrefix;
    const missing: string[] = [];

    const vrfSubscriptionId = env[`${p}_VRF_SUBSCRIPTION_ID`];
    if (!vrfSubscriptionId) missing.push(`${p}_VRF_SUBSCRIPTION_ID`);

    const vrfCoordinator = (env[`${p}_VRF_COORDINATOR`] ??
        network.defaultVrfCoordinator) as `0x${string}` | undefined;
    if (!vrfCoordinator) missing.push(`${p}_VRF_COORDINATOR`);

    const vrfKeyHash = (env[`${p}_VRF_KEY_HASH`] ??
        network.defaultVrfKeyHash) as `0x${string}` | undefined;
    if (!vrfKeyHash) missing.push(`${p}_VRF_KEY_HASH`);

    if (missing.length > 0) {
        throw new Error(
            `Missing required env var(s) for network "${network.name}": ${missing.join(
                ", "
            )}.\n` +
                `Find the VRF coordinator + gas-lane key hash for this chain at ` +
                `https://docs.chain.link/vrf/v2-5/supported-networks and set them in contracts/ethereum/.env`
        );
    }

    return {
        vrfCoordinator: vrfCoordinator!,
        vrfKeyHash: vrfKeyHash!,
        vrfSubscriptionId: vrfSubscriptionId!,
        vrfNativePayment: env[`${p}_VRF_NATIVE_PAYMENT`] === "true",
    };
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
