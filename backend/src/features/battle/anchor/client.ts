/**
 * The chain-touching half of anchoring (§I), behind one interface.
 *
 * Everything *around* a publish is chain-neutral: which batch is next, whether the chain
 * already has it, whether our link matches the chain's head, and what to record afterwards.
 * Only reading the head and sending the transaction differ per chain, so those are the only
 * two methods here.
 *
 * That split is what lets `anchorNextBatch` keep its crash-safety reasoning in one place
 * rather than once per chain. A second implementation that re-derived "is this batch already
 * anchored" would be a second chance to get it wrong.
 */

export type RootHex = `0x${string}`;

/** The registry's `previousRoot` for the very first batch, and its head before any batch. */
export const ZERO_ROOT = `0x${'00'.repeat(32)}` as const;

/** What a registry stores about one batch. Mirrors §I's commitment field list. */
export interface BatchCommitment {
    batchNumber: bigint;
    previousRoot: RootHex;
    merkleRoot: RootHex;
    rulesetSetHash: RootHex;
    firstSequence: bigint;
    lastSequence: bigint;
}

/** Where a registry's chain of batches currently ends. */
export interface RegistryHead {
    /** Highest batch number published. `0n` before the first. */
    batchNumber: bigint;
    /**
     * Root of that batch, which the next batch must name. `ZERO_ROOT` before the first.
     *
     * Normalized to a lowercase `0x`-prefixed 32-byte hex string by the implementation,
     * whatever the chain's native representation is. The caller compares it against a root
     * it stored, so a Solana client returning a byte array or a base58 string would make
     * every comparison fail rather than differ visibly.
     */
    root: RootHex;
}

export interface BatchAnchorClient {
    /** Reads the registry's current head. */
    readHead(): Promise<RegistryHead>;

    /**
     * Publishes one batch and waits for it to be final.
     *
     * **Throws on any failure**, including a transaction that lands and then reverts.
     * Returning a hash for a reverted publish would mark the batch anchored against a
     * transaction that anchored nothing. The caller turns a throw into a retryable outcome,
     * so an implementation should not swallow anything.
     */
    publishBatch(batch: BatchCommitment): Promise<{ txHash: string }>;
}
