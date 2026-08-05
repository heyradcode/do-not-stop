import type { Address, Chain, PublicClient, Transport, WalletClient, Account } from 'viem';

import { prisma } from '@config/prisma';

import { BATTLE_BATCH_REGISTRY_ABI, PUBLISH_BATCH_GAS_LIMIT, ZERO_ROOT } from './abi';

/**
 * Anchoring batch roots in `BattleBatchRegistry` (§I).
 *
 * This is the one place the backend battle path sends a transaction. It anchors a
 * fingerprint of many battles rather than any single one, which is what makes the design
 * affordable — and it is deliberately the *last* step, after signing, publication, and
 * batching, so an outage here costs latency rather than correctness.
 *
 * Anchoring proves publication, not honesty. A root on chain means we cannot later change
 * what a batch contained; it says nothing about whether the battles inside were computed
 * correctly, which is public replay's job (§H).
 */

export interface AnchorContext {
    publicClient: PublicClient<Transport, Chain>;
    walletClient: WalletClient<Transport, Chain, Account>;
    registryAddress: Address;
    chainId: string;
    deploymentId: string;
}

export type AnchorOutcome =
    | { status: 'anchored'; batchNumber: bigint; txHash: string }
    | { status: 'nothing-to-anchor' }
    | { status: 'already-anchored'; batchNumber: bigint }
    | { status: 'out-of-sync'; detail: string }
    | { status: 'failed'; detail: string };

/**
 * Anchors the oldest unanchored batch, if it is the one the registry expects next.
 *
 * One batch per call, in order, on purpose. The registry refuses anything but the next
 * batch number linked to the current head, so there is no useful concurrency here — and
 * attempting several would just mean one success and a queue of reverts.
 *
 * The on-chain head is read *before* submitting rather than discovering a mismatch by
 * paying for a revert. That read also makes this crash-safe: a batch whose transaction
 * landed but whose row never got updated shows up as already anchored on chain, and is
 * reconciled rather than submitted a second time.
 */
export async function anchorNextBatch(context: AnchorContext): Promise<AnchorOutcome> {
    const batch = await prisma.battleBatch.findFirst({
        where: { chainId: context.chainId, deploymentId: context.deploymentId, anchoredAt: null },
        orderBy: { batchNumber: 'asc' },
    });
    if (!batch) {
        return { status: 'nothing-to-anchor' };
    }

    const [onChainNumber, onChainRoot] = await Promise.all([
        context.publicClient.readContract({
            address: context.registryAddress,
            abi: BATTLE_BATCH_REGISTRY_ABI,
            functionName: 'latestBatchNumber',
        }),
        context.publicClient.readContract({
            address: context.registryAddress,
            abi: BATTLE_BATCH_REGISTRY_ABI,
            functionName: 'latestRoot',
        }),
    ]);

    // The transaction landed but the row never got updated — a crash between the two. The
    // chain is the authority here, so reconcile rather than resubmit.
    if (BigInt(onChainNumber) >= batch.batchNumber) {
        await markAnchored(batch.id, null);
        return { status: 'already-anchored', batchNumber: batch.batchNumber };
    }

    const expectedNumber = BigInt(onChainNumber) + 1n;
    if (batch.batchNumber !== expectedNumber) {
        // A batch is missing between the chain's head and ours. Submitting would revert, and
        // guessing which batch to send instead would risk anchoring them out of order.
        return {
            status: 'out-of-sync',
            detail: `registry expects batch ${expectedNumber}, oldest unanchored batch is ${batch.batchNumber}`,
        };
    }

    const previousRoot = (batch.previousRoot ?? ZERO_ROOT) as `0x${string}`;
    if (previousRoot.toLowerCase() !== String(onChainRoot).toLowerCase()) {
        // Our idea of the chain's head disagrees with the chain's. Anchoring anyway would
        // revert; the divergence needs a human, since it means the local batch chain was
        // built on something the registry never accepted.
        return {
            status: 'out-of-sync',
            detail: `batch ${batch.batchNumber} links to ${previousRoot} but the registry head is ${String(onChainRoot)}`,
        };
    }

    try {
        const hash = await context.walletClient.writeContract({
            address: context.registryAddress,
            abi: BATTLE_BATCH_REGISTRY_ABI,
            functionName: 'publishBatch',
            args: [
                batch.batchNumber,
                previousRoot,
                batch.merkleRoot as `0x${string}`,
                batch.rulesetSetHash as `0x${string}`,
                batch.firstSequence,
                batch.lastSequence,
            ],
            gas: PUBLISH_BATCH_GAS_LIMIT,
        });
        const receipt = await context.publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== 'success') {
            return { status: 'failed', detail: `publishBatch(${batch.batchNumber}) reverted in ${hash}` };
        }

        await markAnchored(batch.id, hash);
        return { status: 'anchored', batchNumber: batch.batchNumber, txHash: hash };
    } catch (error) {
        // Left unanchored so the next pass retries it. The batch itself is already durable
        // and its receipts already public; only the anchor is missing.
        return { status: 'failed', detail: describe(error) };
    }
}

/**
 * Records that a batch is anchored.
 *
 * `txHash` is null when reconciling a batch found already anchored on chain: we know it
 * landed but not in which transaction, and inventing a hash would be worse than admitting
 * the gap. The event log is the record of record either way.
 */
async function markAnchored(batchId: string, txHash: string | null): Promise<void> {
    await prisma.battleBatch.update({
        where: { id: batchId },
        data: { anchoredAt: new Date(), ...(txHash ? { anchoredTxHash: txHash } : {}) },
    });
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message.split('\n')[0]! : String(error);
}
