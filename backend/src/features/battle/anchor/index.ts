import type { Address } from 'viem';

import { env, type AnchorConfig } from '@config/env';
import { buildNextBatch, type BatchScope } from '@features/battle/batcher';

import { anchorNextBatch, type AnchorContext } from './anchor.service';
import { createEvmAnchorClient, evmClientsFor } from './evmClient';
import { createSolanaAnchorClient } from './solanaClient';

export { anchorNextBatch, type AnchorContext, type AnchorOutcome } from './anchor.service';
export { ZERO_ROOT, type BatchAnchorClient, type BatchCommitment, type RegistryHead } from './client';
export { createEvmAnchorClient, evmClientsFor } from './evmClient';
export { createSolanaAnchorClient, keypairFrom } from './solanaClient';
export { BATTLE_BATCH_REGISTRY_ABI, PUBLISH_BATCH_GAS_LIMIT } from './abi';

/**
 * The batch-and-anchor loop (§I).
 *
 * Batching and anchoring run on one timer, in that order, because they are the two halves
 * of the same job: aggregate what is publishable, then anchor what is aggregated. Both are
 * idempotent and both no-op when there is nothing to do, so the interval only controls
 * latency, never correctness.
 *
 * **One timer per configured chain id**, not one per process. A deployment serving several
 * chains has an independent receipt sequence per chain, and each anchors against its own
 * registry, so nothing is shared between them: one chain's RPC being unreachable must not
 * stop another's batches from being built.
 *
 * Batching runs whether or not anchoring is configured. Receipts that are never batched are
 * never eligible for a season, so declining to batch an unanchorable chain would strand its
 * players permanently rather than merely leave their history un-anchored.
 */

export interface BatchAnchorHandle {
    stop(): void;
}

let handles: BatchAnchorHandle[] = [];

export function startBatchAnchor(): void {
    if (!env.battle.enabled) {
        return;
    }
    handles = env.battle.chainIds.map(startForChain);
}

function startForChain(chainId: string): BatchAnchorHandle {
    const scope: BatchScope = { chainId, deploymentId: env.battle.deploymentId };
    const anchor = anchorContextFor(scope);
    const { anchorIntervalMs } = env.battle;

    if (anchor) {
        // Read from config rather than the context: the registry address is the client's
        // business now, and re-exposing it on `AnchorContext` just to log it would put a
        // chain-specific field back on the chain-neutral type.
        const registry = env.battle.anchors[chainId]?.registryAddress;
        console.log(
            `[battle-anchor] ${chainId}: batching and anchoring every ${anchorIntervalMs}ms to ${registry}`,
        );
    } else {
        console.log(
            `[battle-anchor] ${chainId}: batching every ${anchorIntervalMs}ms but never anchoring ` +
                '(BATTLE_ANCHOR_* not fully set for this chain; receipts stay signed and public either way)',
        );
    }

    const timer = setInterval(() => void runOnce(scope, anchor), anchorIntervalMs);
    timer.unref();
    return { stop: () => clearInterval(timer) };
}

/**
 * The anchoring client for one chain, or undefined when it has none.
 *
 * Which client to build comes from the config's `kind`, which `env` derives from the chain
 * id's namespace. There is no way to reach the EVM client with a Solana chain id, so the
 * earlier runtime guard against that is gone rather than merely satisfied.
 */
function anchorContextFor(scope: BatchScope): AnchorContext | undefined {
    const config: AnchorConfig | undefined = env.battle.anchors[scope.chainId];
    if (!config) {
        return undefined;
    }

    // Construction parses a key and an address, so a typo throws here rather than on the
    // first tick. Caught, because the alternative is worse than not anchoring: this runs at
    // boot from `startBatchAnchor`, and an uncaught throw takes down battles, chat and every
    // read with it. Missing config already degrades to batch-only; malformed config must not
    // be more severe than absent config.
    let client;
    try {
        client =
            config.kind === 'evm'
                ? createEvmAnchorClient(evmClientsFor(config), config.registryAddress as Address)
                : createSolanaAnchorClient(config);
    } catch (error) {
        console.error(
            `[battle-anchor] ${scope.chainId}: anchor settings are present but unusable, so batches ` +
                `will be built and left unanchored: ${(error as Error).message.split('\n')[0]}`,
        );
        return undefined;
    }

    return { client, chainId: scope.chainId, deploymentId: scope.deploymentId };
}

export function stopBatchAnchor(): void {
    for (const handle of handles) {
        handle.stop();
    }
    handles = [];
}

/**
 * One pass for one chain: build whatever is batchable, then anchor whatever is unanchored.
 *
 * Both halves are wrapped separately so a failure in either is reported and the next tick
 * still runs. `anchor` is undefined for a chain with no registry configured, which skips
 * anchoring only, never batching.
 */
export async function runOnce(scope: BatchScope, anchor?: AnchorContext): Promise<void> {
    try {
        const built = await buildNextBatch(scope);
        if (built.status === 'batched') {
            console.log(
                `[battle-anchor] ${scope.chainId}: built batch ${built.batchNumber} over ${built.receiptCount} receipts`,
            );
        }
    } catch (error) {
        console.error(`[battle-anchor] ${scope.chainId}: batching failed: ${(error as Error).message.split('\n')[0]}`);
    }

    if (!anchor) {
        return;
    }

    try {
        const anchored = await anchorNextBatch(anchor);
        if (anchored.status === 'anchored') {
            console.log(
                `[battle-anchor] ${scope.chainId}: anchored batch ${anchored.batchNumber} in ${anchored.txHash}`,
            );
        } else if (anchored.status === 'out-of-sync' || anchored.status === 'failed') {
            // Loud: an unanchored backlog past the inclusion SLO is operator failure (§I).
            console.error(`[battle-anchor] ${scope.chainId}: ${anchored.status}: ${anchored.detail}`);
        }
    } catch (error) {
        console.error(`[battle-anchor] ${scope.chainId}: anchoring failed: ${(error as Error).message.split('\n')[0]}`);
    }
}
