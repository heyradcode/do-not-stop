import {
    createPublicClient,
    createWalletClient,
    http,
    type Account,
    type Address,
    type Chain,
    type PublicClient,
    type Transport,
    type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import type { EvmAnchorConfig } from '@config/env';

import { BATTLE_BATCH_REGISTRY_ABI, PUBLISH_BATCH_GAS_LIMIT } from './abi';
import type { BatchAnchorClient, BatchCommitment, RegistryHead, RootHex } from './client';

/**
 * `BatchAnchorClient` over an EVM `BattleBatchRegistry` (§I).
 *
 * Every viem call in the anchoring path lives here and nowhere else, so the service above
 * has no idea which chain it is anchoring to.
 */

export interface EvmAnchorClients {
    publicClient: PublicClient<Transport, Chain>;
    walletClient: WalletClient<Transport, Chain, Account>;
}

/** Builds the viem clients for one registry. Separate so tests can supply their own. */
export function evmClientsFor(config: EvmAnchorConfig): EvmAnchorClients {
    const chain = {
        id: config.evmChainId,
        name: `chain-${config.evmChainId}`,
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: { default: { http: [config.rpcUrl] } },
    } as const satisfies Chain;

    return {
        publicClient: createPublicClient({ chain, transport: http(config.rpcUrl) }),
        walletClient: createWalletClient({
            account: privateKeyToAccount(config.privateKey),
            chain,
            transport: http(config.rpcUrl),
        }),
    };
}

export function createEvmAnchorClient(
    clients: EvmAnchorClients,
    registryAddress: Address,
): BatchAnchorClient {
    return {
        async readHead(): Promise<RegistryHead> {
            const [batchNumber, root] = await Promise.all([
                clients.publicClient.readContract({
                    address: registryAddress,
                    abi: BATTLE_BATCH_REGISTRY_ABI,
                    functionName: 'latestBatchNumber',
                }),
                clients.publicClient.readContract({
                    address: registryAddress,
                    abi: BATTLE_BATCH_REGISTRY_ABI,
                    functionName: 'latestRoot',
                }),
            ]);
            return {
                batchNumber: BigInt(batchNumber),
                root: String(root).toLowerCase() as RootHex,
            };
        },

        async publishBatch(batch: BatchCommitment): Promise<{ txHash: string }> {
            const hash = await clients.walletClient.writeContract({
                address: registryAddress,
                abi: BATTLE_BATCH_REGISTRY_ABI,
                functionName: 'publishBatch',
                args: [
                    batch.batchNumber,
                    batch.previousRoot,
                    batch.merkleRoot,
                    batch.rulesetSetHash,
                    batch.firstSequence,
                    batch.lastSequence,
                ],
                gas: PUBLISH_BATCH_GAS_LIMIT,
            });

            const receipt = await clients.publicClient.waitForTransactionReceipt({ hash });
            if (receipt.status !== 'success') {
                // Thrown rather than returned: a hash for a reverted publish would mark the
                // batch anchored against a transaction that anchored nothing.
                throw new Error(`publishBatch(${batch.batchNumber}) reverted in ${hash}`);
            }
            return { txHash: hash };
        },
    };
}
