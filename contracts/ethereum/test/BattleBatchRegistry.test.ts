import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { parseEventLogs, toFunctionSelector } from "viem";

/**
 * Asserts a call reverted with a specific custom error.
 *
 * Matches the error *name* or its 4-byte selector, because viem decodes custom errors on
 * some paths and reports a bare `unrecognized custom error (return data: 0x...)` on others
 * — notably when the revert surfaces during gas estimation. Matching only the name would
 * make this test depend on which path viem happened to take rather than on what the
 * contract did. The selector is derived from the signature, so renaming an error still
 * fails the test rather than silently matching nothing.
 */
async function rejectsWithError(promise: Promise<unknown>, signature: string): Promise<void> {
    const name = signature.slice(0, signature.indexOf("("));
    // Custom-error selectors are the first 4 bytes of keccak(signature), the same rule
    // functions use — so the bare signature, with no `error ` prefix to hash along with it.
    const selector = toFunctionSelector(signature);
    await assert.rejects(promise, (error: unknown) => {
        const text = String(error);
        assert.ok(
            text.includes(name) || text.includes(selector),
            `expected a revert with ${signature} (${selector}), got:\n${text}`,
        );
        return true;
    });
}

/**
 * BattleBatchRegistry (docs/battle-protocol.md §I).
 *
 * The contract's only real guarantee is ordering: batches are append-only, linked, and
 * sequence-contiguous. Most of what follows is aimed at that, because a registry that
 * accepted a batch out of order, or let one be republished, would let the operator rewrite
 * the history it exists to fix.
 */
describe("BattleBatchRegistry", async function () {
    const { viem } = await network.connect();

    const ROOT_1 = `0x${"11".repeat(32)}` as const;
    const ROOT_2 = `0x${"22".repeat(32)}` as const;
    const ROOT_3 = `0x${"33".repeat(32)}` as const;
    const RULESET_SET = `0x${"aa".repeat(32)}` as const;
    const ZERO = `0x${"00".repeat(32)}` as const;

    async function deploy() {
        const [owner, publisher, stranger] = await viem.getWalletClients();
        const registry = await viem.deployContract("BattleBatchRegistry", [owner.account.address]);
        await registry.write.setPublisher([publisher.account.address, true]);
        return { registry, owner, publisher, stranger };
    }

    /** Publishes batch n, continuing from wherever the registry currently is. */
    async function publish(
        registry: Awaited<ReturnType<typeof deploy>>["registry"],
        publisher: Awaited<ReturnType<typeof deploy>>["publisher"],
        batchNumber: bigint,
        previousRoot: `0x${string}`,
        merkleRoot: `0x${string}`,
        firstSequence: bigint,
        lastSequence: bigint,
    ) {
        return registry.write.publishBatch(
            [batchNumber, previousRoot, merkleRoot, RULESET_SET, firstSequence, lastSequence],
            { account: publisher.account },
        );
    }

    describe("publishing", () => {
        it("accepts the first batch and records every committed field", async () => {
            const { registry, publisher } = await deploy();

            await publish(registry, publisher, 1n, ZERO, ROOT_1, 1n, 100n);

            const batch = await registry.read.getBatch([1n]);
            assert.equal(batch.previousRoot, ZERO);
            assert.equal(batch.merkleRoot, ROOT_1);
            assert.equal(batch.rulesetSetHash, RULESET_SET);
            assert.equal(batch.firstSequence, 1n);
            assert.equal(batch.lastSequence, 100n);
            assert.ok(batch.publishedAt > 0n);
        });

        it("advances the head so the next batch knows what to link to", async () => {
            const { registry, publisher } = await deploy();

            await publish(registry, publisher, 1n, ZERO, ROOT_1, 1n, 100n);

            assert.equal(await registry.read.latestBatchNumber(), 1n);
            assert.equal(await registry.read.latestRoot(), ROOT_1);
        });

        it("chains batches together", async () => {
            const { registry, publisher } = await deploy();

            await publish(registry, publisher, 1n, ZERO, ROOT_1, 1n, 100n);
            await publish(registry, publisher, 2n, ROOT_1, ROOT_2, 101n, 200n);
            await publish(registry, publisher, 3n, ROOT_2, ROOT_3, 201n, 300n);

            assert.equal(await registry.read.latestBatchNumber(), 3n);
            assert.equal((await registry.read.getBatch([3n])).previousRoot, ROOT_2);
        });

        it("emits the batch for anyone watching the chain", async () => {
            const { registry, publisher } = await deploy();
            const hash = await publish(registry, publisher, 1n, ZERO, ROOT_1, 1n, 100n);

            const client = await viem.getPublicClient();
            const receipt = await client.waitForTransactionReceipt({ hash });
            const logs = parseEventLogs({ abi: registry.abi, eventName: "BatchPublished", logs: receipt.logs });

            assert.equal(logs.length, 1);
            assert.equal(logs[0]!.args.batchNumber, 1n);
            assert.equal(logs[0]!.args.merkleRoot, ROOT_1);
            assert.equal(logs[0]!.args.lastSequence, 100n);
        });
    });

    describe("ordering, which is the only thing this contract really guarantees", () => {
        it("refuses a skipped batch number", async () => {
            const { registry, publisher } = await deploy();
            await publish(registry, publisher, 1n, ZERO, ROOT_1, 1n, 100n);

            await rejectsWithError(publish(registry, publisher, 3n, ROOT_1, ROOT_2, 101n, 200n), "WrongBatchNumber(uint64,uint64)");
        });

        it("refuses republishing a batch number already used", async () => {
            // Otherwise the operator could overwrite what a batch contained after the fact.
            const { registry, publisher } = await deploy();
            await publish(registry, publisher, 1n, ZERO, ROOT_1, 1n, 100n);

            await rejectsWithError(publish(registry, publisher, 1n, ZERO, ROOT_2, 1n, 100n), "WrongBatchNumber(uint64,uint64)");
        });

        it("refuses a batch that does not link to the current head", async () => {
            // This is what makes the chain append-only rather than merely fork-detectable.
            const { registry, publisher } = await deploy();
            await publish(registry, publisher, 1n, ZERO, ROOT_1, 1n, 100n);

            await rejectsWithError(publish(registry, publisher, 2n, ROOT_3, ROOT_2, 101n, 200n), "WrongPreviousRoot(bytes32,bytes32)");
        });

        it("refuses a sequence gap between batches", async () => {
            // The check that turns "we published some receipts" into "we published all of
            // them, in order, or the transaction reverted".
            const { registry, publisher } = await deploy();
            await publish(registry, publisher, 1n, ZERO, ROOT_1, 1n, 100n);

            await rejectsWithError(publish(registry, publisher, 2n, ROOT_1, ROOT_2, 102n, 200n), "SequenceNotContiguous(uint64,uint64)");
        });

        it("refuses a sequence range that overlaps the previous batch", async () => {
            const { registry, publisher } = await deploy();
            await publish(registry, publisher, 1n, ZERO, ROOT_1, 1n, 100n);

            await rejectsWithError(publish(registry, publisher, 2n, ROOT_1, ROOT_2, 100n, 200n), "SequenceNotContiguous(uint64,uint64)");
        });

        it("refuses an inverted sequence range", async () => {
            const { registry, publisher } = await deploy();
            await rejectsWithError(publish(registry, publisher, 1n, ZERO, ROOT_1, 100n, 1n), "BadSequenceRange()");
        });

        it("accepts a single-receipt batch", async () => {
            const { registry, publisher } = await deploy();
            await publish(registry, publisher, 1n, ZERO, ROOT_1, 7n, 7n);
            assert.equal((await registry.read.getBatch([1n])).firstSequence, 7n);
        });

        it("refuses an empty root", async () => {
            // An unpublished batch reads as the zero root, so accepting one would make
            // "never published" and "published nothing" indistinguishable.
            const { registry, publisher } = await deploy();
            await rejectsWithError(publish(registry, publisher, 1n, ZERO, ZERO, 1n, 100n), "EmptyRoot()");
        });
    });

    describe("who may publish", () => {
        it("refuses a wallet that was never granted the role", async () => {
            const { registry, stranger } = await deploy();
            await rejectsWithError(
                registry.write.publishBatch([1n, ZERO, ROOT_1, RULESET_SET, 1n, 100n], {
                    account: stranger.account,
                }),
                "NotPublisher()",
            );
        });

        it("lets the owner revoke a publisher, so a compromised key can be rotated out", async () => {
            const { registry, publisher } = await deploy();
            await registry.write.setPublisher([publisher.account.address, false]);

            await rejectsWithError(publish(registry, publisher, 1n, ZERO, ROOT_1, 1n, 100n), "NotPublisher()");
        });

        it("does not let a publisher grant the role to anyone else", async () => {
            const { registry, publisher, stranger } = await deploy();
            await rejectsWithError(
                registry.write.setPublisher([stranger.account.address, true], { account: publisher.account }),
                "OwnableUnauthorizedAccount(address)",
            );
        });
    });

    describe("emergency pause", () => {
        it("stops new batches while paused", async () => {
            const { registry, publisher } = await deploy();
            await registry.write.pause();

            await rejectsWithError(publish(registry, publisher, 1n, ZERO, ROOT_1, 1n, 100n), "EnforcedPause()");
        });

        it("resumes exactly where it left off, invalidating nothing", async () => {
            // Pausing is the right response to a suspected signer compromise, and it must
            // not cost the batches already published.
            const { registry, publisher } = await deploy();
            await publish(registry, publisher, 1n, ZERO, ROOT_1, 1n, 100n);

            await registry.write.pause();
            await registry.write.unpause();
            await publish(registry, publisher, 2n, ROOT_1, ROOT_2, 101n, 200n);

            assert.equal(await registry.read.latestBatchNumber(), 2n);
            assert.equal((await registry.read.getBatch([1n])).merkleRoot, ROOT_1);
        });

        it("only the owner may pause", async () => {
            const { registry, publisher } = await deploy();
            await rejectsWithError(
                registry.write.pause({ account: publisher.account }),
                "OwnableUnauthorizedAccount(address)",
            );
        });
    });

    describe("isPublishedRoot", () => {
        it("confirms a root that was published", async () => {
            const { registry, publisher } = await deploy();
            await publish(registry, publisher, 1n, ZERO, ROOT_1, 1n, 100n);

            assert.equal(await registry.read.isPublishedRoot([1n, ROOT_1]), true);
        });

        it("rejects a root under the wrong batch number", async () => {
            const { registry, publisher } = await deploy();
            await publish(registry, publisher, 1n, ZERO, ROOT_1, 1n, 100n);

            assert.equal(await registry.read.isPublishedRoot([2n, ROOT_1]), false);
        });

        it("never reads an unpublished batch as an accepted root", async () => {
            // A claim contract asking about a batch that does not exist must get a no,
            // not an accidental yes from a zeroed slot.
            const { registry } = await deploy();
            assert.equal(await registry.read.isPublishedRoot([99n, ZERO]), false);
        });
    });
});
