import type { Hex } from '@cryptopets/protocol';
import { BattleState } from '@generated/prisma/enums';

import { env } from '@config/env';
import { prisma } from '@config/prisma';

import { buildBatch, type BatchableReceipt } from './batch.builder';

/**
 * Aggregating published receipts into Merkle batches (§I).
 *
 * Normal battles send no transactions. This is the only part of the backend battle path
 * that ever touches a chain, and even then it anchors a fingerprint of many battles rather
 * than any single one — which is what makes the whole design affordable.
 *
 * Batching is not outbox work. The outbox carries per-battle steps, and a batch is by
 * definition about many battles at once, so it runs on its own schedule and finds its
 * inputs by query. A `batch` outbox message per receipt would just be a queue that has to
 * be drained in lockstep anyway.
 */

export interface BatchScope {
    chainId: string;
    deploymentId: string;
}

export type BatchOutcome =
    | { status: 'batched'; batchNumber: bigint; merkleRoot: string; receiptCount: number }
    | { status: 'nothing-to-batch' }
    | { status: 'below-threshold'; available: number; minimum: number };

/**
 * Builds and records the next batch for one chain and deployment.
 *
 * Receipts are taken **in sequence order, starting where the last batch ended**, and only a
 * contiguous run is taken. If receipt N is missing — still unpublished, or withheld — the
 * batch stops at N-1 rather than skipping it. Anchoring around a hole would produce a root
 * that looks complete while omitting a battle, and §I is explicit that omission has to stay
 * visible rather than be papered over.
 *
 * Recording the batch and moving its battles to `batched` happen in one transaction. A
 * batch whose receipts were not marked, or marked receipts with no batch, would both lead
 * to the same place: a receipt that is either anchored twice or never.
 */
export async function buildNextBatch(scope: BatchScope, minimumSize = env.battle.batchMinSize): Promise<BatchOutcome> {
    const previous = await prisma.battleBatch.findFirst({
        where: { chainId: scope.chainId, deploymentId: scope.deploymentId },
        orderBy: { batchNumber: 'desc' },
    });

    const candidates = await prisma.battleReceipt.findMany({
        where: {
            chainId: scope.chainId,
            deploymentId: scope.deploymentId,
            batchId: null,
            battle: { state: BattleState.published },
        },
        orderBy: { sequence: 'asc' },
        take: env.battle.batchMaxSize,
        select: { receiptHash: true, sequence: true, battleId: true, payload: true },
    });

    if (candidates.length === 0) {
        return { status: 'nothing-to-batch' };
    }

    const expectedFirst = previous ? previous.lastSequence + 1n : candidates[0]!.sequence;
    const run = contiguousRunFrom(candidates, expectedFirst);
    if (run.length === 0) {
        // The next receipt by sequence is not the one the chain expects next. Waiting is
        // correct: the missing one may still be mid-pipeline, and batching past it would
        // anchor a gap.
        return { status: 'nothing-to-batch' };
    }
    if (run.length < minimumSize) {
        return { status: 'below-threshold', available: run.length, minimum: minimumSize };
    }

    const built = buildBatch(
        run.map<BatchableReceipt>((receipt) => ({
            receiptHash: receipt.receiptHash,
            sequence: receipt.sequence,
            rulesetHash: rulesetHashOf(receipt.payload),
        })),
    );
    const batchNumber = previous ? previous.batchNumber + 1n : 1n;

    await prisma.$transaction(async (tx) => {
        const batch = await tx.battleBatch.create({
            data: {
                chainId: scope.chainId,
                deploymentId: scope.deploymentId,
                batchNumber,
                previousRoot: previous?.merkleRoot ?? null,
                merkleRoot: built.merkleRoot,
                rulesetSetHash: built.rulesetSetHash,
                firstSequence: built.firstSequence,
                lastSequence: built.lastSequence,
            },
        });
        await tx.battleReceipt.updateMany({
            where: { receiptHash: { in: built.receiptHashes } },
            data: { batchId: batch.id },
        });
        for (const receipt of run) {
            await tx.battleLedger.updateMany({
                where: { battleId: receipt.battleId, state: BattleState.published },
                data: { state: BattleState.batched },
            });
        }
    });

    return {
        status: 'batched',
        batchNumber,
        merkleRoot: built.merkleRoot,
        receiptCount: run.length,
    };
}

/**
 * The longest run starting at `expectedFirst` with no gaps.
 *
 * Returns empty when the first candidate is not `expectedFirst` at all, which means the
 * receipt the chain expects next has not been published yet.
 */
function contiguousRunFrom<T extends { sequence: bigint }>(candidates: readonly T[], expectedFirst: bigint): T[] {
    const run: T[] = [];
    let expected = expectedFirst;
    for (const candidate of candidates) {
        if (candidate.sequence !== expected) break;
        run.push(candidate);
        expected += 1n;
    }
    return run;
}

/** The ruleset a stored receipt names. */
function rulesetHashOf(payload: unknown): string {
    const hash = (payload as { rulesetHash?: unknown } | null)?.rulesetHash;
    if (typeof hash !== 'string') {
        throw new Error('stored receipt payload has no rulesetHash');
    }
    return hash;
}

export interface InclusionProof {
    receiptHash: string;
    batchNumber: string;
    merkleRoot: string;
    proof: Hex[];
}

/**
 * The proof that a receipt is in its batch's root (§I's "publish receipt-to-root inclusion
 * proofs").
 *
 * Rebuilt from the batch's own receipts rather than stored, because storing a proof per
 * receipt would duplicate a tree that is cheap to recompute and could drift from it. Null
 * when the receipt exists but has not been batched yet, which is a normal state and not an
 * error — an *unbatched* receipt past the inclusion SLO is operator failure, but one
 * batched a minute from now is just waiting.
 */
export async function getInclusionProof(receiptHash: string): Promise<InclusionProof | null> {
    const receipt = await prisma.battleReceipt.findUnique({
        where: { receiptHash },
        select: { batchId: true, receiptHash: true },
    });
    if (!receipt?.batchId) return null;

    const batch = await prisma.battleBatch.findUnique({
        where: { id: receipt.batchId },
        include: {
            receipts: {
                orderBy: { sequence: 'asc' },
                select: { receiptHash: true, sequence: true, payload: true },
            },
        },
    });
    if (!batch) return null;

    const built = buildBatch(
        batch.receipts.map<BatchableReceipt>((row) => ({
            receiptHash: row.receiptHash,
            sequence: row.sequence,
            rulesetHash: rulesetHashOf(row.payload),
        })),
    );
    // A rebuilt root that disagrees with the stored one means the batch's membership
    // changed after it was anchored. Serving a proof against the recomputed root would hide
    // that; refusing surfaces it.
    if (built.merkleRoot.toLowerCase() !== batch.merkleRoot.toLowerCase()) {
        throw new Error(
            `batch ${batch.batchNumber} rebuilds to ${built.merkleRoot} but was recorded as ${batch.merkleRoot}`,
        );
    }

    return {
        receiptHash: receipt.receiptHash,
        batchNumber: batch.batchNumber.toString(),
        merkleRoot: batch.merkleRoot,
        proof: built.proofFor(receipt.receiptHash),
    };
}
