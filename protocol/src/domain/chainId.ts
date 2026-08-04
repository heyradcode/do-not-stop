/**
 * Chain identity for signed protocol objects.
 *
 * One string covers both chains, in CAIP-2 shape: `<namespace>:<reference>`.
 * A single field means an object can never carry a coherent-looking but
 * meaningless pairing such as "Solana, chain id 84532", which a separate
 * `chain` plus numeric `chainId` allows.
 *
 * EVM uses the standard `eip155:<chain id>` form. Solana uses a cluster name
 * rather than CAIP-2's genesis-hash reference, because clusters are what this
 * repo actually configures and a genesis-hash lookup would buy nothing here:
 * environment separation is `deploymentId`'s job, not the chain id's.
 */

/** `<namespace>:<reference>`, e.g. `eip155:84532` or `solana:devnet`. */
export type ChainId = `eip155:${number}` | `solana:${SolanaCluster}`;

/** Solana clusters this protocol recognizes. */
export type SolanaCluster = 'mainnet' | 'devnet' | 'testnet' | 'localnet';

const SOLANA_CLUSTERS: readonly SolanaCluster[] = ['mainnet', 'devnet', 'testnet', 'localnet'];
const EVM_PATTERN = /^eip155:([1-9][0-9]*)$/;
const SOLANA_PATTERN = /^solana:([a-z]+)$/;

/** Chain id for an EVM network, e.g. 84532 (Base Sepolia) or 31337 (Hardhat). */
export function evmChainId(chainId: number): ChainId {
    if (!Number.isSafeInteger(chainId) || chainId <= 0) {
        throw new Error(`not a valid EVM chain id: ${chainId}`);
    }
    return `eip155:${chainId}`;
}

/** Chain id for a Solana cluster. */
export function solanaChainId(cluster: SolanaCluster): ChainId {
    if (!SOLANA_CLUSTERS.includes(cluster)) {
        throw new Error(`not a known Solana cluster: ${cluster}`);
    }
    return `solana:${cluster}`;
}

/** Narrows an untrusted string, throwing on anything this protocol does not define. */
export function assertChainId(value: string): ChainId {
    const evm = EVM_PATTERN.exec(value);
    if (evm) {
        return evmChainId(Number(evm[1]));
    }
    const solana = SOLANA_PATTERN.exec(value);
    if (solana) {
        return solanaChainId(solana[1] as SolanaCluster);
    }
    throw new Error(`not a valid chain id: ${JSON.stringify(value)} (expected eip155:<id> or solana:<cluster>)`);
}

/**
 * Which chain family a chain id belongs to, in this repo's own vocabulary
 * (`pet_roster.chain`, the `ChainAdapter` split, the two settle keepers).
 */
export function chainFamily(chainId: ChainId): 'evm' | 'solana' {
    return chainId.startsWith('eip155:') ? 'evm' : 'solana';
}

/**
 * The numeric chain id an EIP-712 domain needs. Throws for Solana, where there is
 * no such number and a caller asking for one has taken a wrong turn.
 */
export function evmChainIdNumber(chainId: ChainId): number {
    const match = EVM_PATTERN.exec(chainId);
    if (!match) {
        throw new Error(`${chainId} is not an EVM chain id, so it has no numeric chain id`);
    }
    return Number(match[1]);
}
