import { env } from '@config/env';
import { type ClaimedMessage, claimOutbox, failOutbox, OUTBOX_TOPICS } from '@features/battle-ledger';

import { processAwaitBeaconMessage } from './beacon.worker';
import { processComputeMessage } from './compute.worker';
import { processPublishMessage } from './publish.worker';
import { processSignMessage } from './sign.worker';
import { processVerifyMessage } from './verify.worker';

/**
 * Dispatches claimed outbox messages to their handler.
 *
 * A handler that throws is a real failure — a network exception, a database error, a
 * programming bug — and goes through `failOutbox`'s backoff-then-dead-letter path. A handler
 * that returns normally is expected to have already called `completeOutbox`,
 * `rescheduleOutbox`, or `applyTransition` itself; the dispatcher does not call
 * `completeOutbox` a second time; a handler that does neither leaves the message claimed and
 * is a bug in that handler, not something this loop papers over.
 */
const HANDLERS: Record<string, (message: ClaimedMessage, nowSeconds: number) => Promise<void>> = {
    [OUTBOX_TOPICS.awaitBeacon]: processAwaitBeaconMessage,
    [OUTBOX_TOPICS.compute]: processComputeMessage,
    [OUTBOX_TOPICS.verify]: processVerifyMessage,
    [OUTBOX_TOPICS.sign]: processSignMessage,
    [OUTBOX_TOPICS.publish]: processPublishMessage,
};

/** One poll: claims due messages for the topics this worker owns and processes each in turn. */
export async function runBattleWorkerOnce(workerId: string, now: Date = new Date()): Promise<{ processed: number }> {
    const topics = Object.keys(HANDLERS) as (typeof OUTBOX_TOPICS)[keyof typeof OUTBOX_TOPICS][];
    const messages = await claimOutbox(topics, workerId, env.battle.workerBatchSize, now);
    const nowSeconds = Math.floor(now.getTime() / 1000);

    for (const message of messages) {
        const handler = HANDLERS[message.topic];
        if (!handler) {
            // Claimed a topic this process does not know how to run. That is a deployment or
            // routing bug, not a transient failure, but dead-lettering it immediately is safer
            // than leaving it claimed forever with nothing to process it.
            await failOutbox(message, `no handler for topic ${message.topic}`, now);
            continue;
        }
        try {
            await handler(message, nowSeconds);
        } catch (error) {
            await failOutbox(message, (error as Error).message, now);
        }
    }

    return { processed: messages.length };
}

export interface BattleWorkerHandle {
    stop(): void;
}

/** Starts polling on an interval. `workerId` should be unique per process for the outbox lock. */
export function startBattleWorker(workerId: string): BattleWorkerHandle {
    const timer = setInterval(() => {
        void runBattleWorkerOnce(workerId).catch((error: Error) => {
            // eslint-disable-next-line no-console
            console.error(`[battle-worker] poll failed: ${error.message}`);
        });
    }, env.battle.workerPollIntervalMs);
    return { stop: () => clearInterval(timer) };
}
