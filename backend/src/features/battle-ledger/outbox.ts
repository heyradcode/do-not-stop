import type { Prisma } from '@generated/prisma/client';

import { prisma } from '@config/prisma';

/**
 * Transactional outbox for the battle workflow (§J).
 *
 * A state transition and the message scheduling whatever comes next are written in one
 * transaction, so a crash between them is impossible. Without that, a battle can end up
 * `committed` with nobody waiting for its beacon: not lost exactly, but stalled until
 * someone notices, which for a player is the same thing.
 *
 * Delivery is at least once, never exactly once. Handlers therefore have to be idempotent,
 * which is what `classifyTransition`'s `noop` case is for.
 */

/** What the message tells a worker to do next. */
export const OUTBOX_TOPICS = {
    /** Wait for the committed drand round, then verify it and derive the seed. */
    awaitBeacon: 'await-beacon',
    /** Run the fight through the canonical engine. */
    compute: 'compute',
    /** Ask the independent Go verifier to recompute the result. */
    verify: 'verify',
    /** Sign the receipt with the KMS key. */
    sign: 'sign',
    /** Publish the receipt to the public corpus. */
    publish: 'publish',
    /** Include the receipt in the next Merkle batch. */
    batch: 'batch',
} as const;

export type OutboxTopic = (typeof OUTBOX_TOPICS)[keyof typeof OUTBOX_TOPICS];

/** Retries before a message is dead-lettered. */
export const MAX_OUTBOX_ATTEMPTS = 8;
/** First retry delay; doubles each attempt up to the cap. */
const BASE_RETRY_SECONDS = 2;
const MAX_RETRY_SECONDS = 300;

/** A message ready to be enqueued. */
export interface OutboxMessage {
    battleId: string;
    topic: OutboxTopic;
    payload?: Prisma.InputJsonValue;
    /** Earliest time a worker may claim it. Used to wait for a round rather than spin. */
    availableAt?: Date;
}

/** A claimed message, handed to a worker. */
export interface ClaimedMessage {
    id: string;
    battleId: string;
    topic: string;
    payload: Prisma.JsonValue;
    attempts: number;
}

/** Minimal surface both `prisma` and a `$transaction` client satisfy. */
export type OutboxClient = Pick<Prisma.TransactionClient, 'battleOutbox'>;

/**
 * Enqueues messages. Takes a client so it can join the caller's transaction: enqueueing
 * outside the transition's transaction is the bug this parameter exists to prevent.
 */
export async function enqueueOutbox(client: OutboxClient, messages: readonly OutboxMessage[]): Promise<void> {
    if (messages.length === 0) {
        return;
    }
    await client.battleOutbox.createMany({
        data: messages.map((message) => ({
            battleId: message.battleId,
            topic: message.topic,
            payload: message.payload ?? {},
            ...(message.availableAt ? { availableAt: message.availableAt } : {}),
        })),
    });
}

/**
 * Claims up to `limit` due messages for `workerId`.
 *
 * Claiming is a two-step read-then-update rather than a single `SELECT ... FOR UPDATE
 * SKIP LOCKED`, because Prisma cannot express the latter without raw SQL. The update is
 * guarded on `lockedAt: null`, so two workers racing for one message means one of them
 * updates zero rows and simply does not get it. That is safe precisely because handlers
 * are idempotent; if they were not, this would need the raw query.
 */
export async function claimOutbox(
    topics: readonly OutboxTopic[],
    workerId: string,
    limit: number,
    now: Date,
): Promise<ClaimedMessage[]> {
    const candidates = await prisma.battleOutbox.findMany({
        where: {
            processedAt: null,
            deadLetteredAt: null,
            lockedAt: null,
            availableAt: { lte: now },
            topic: { in: [...topics] },
        },
        orderBy: { availableAt: 'asc' },
        take: limit,
    });

    const claimed: ClaimedMessage[] = [];
    for (const candidate of candidates) {
        const { count } = await prisma.battleOutbox.updateMany({
            where: { id: candidate.id, lockedAt: null, processedAt: null },
            data: { lockedAt: now, lockedBy: workerId, attempts: { increment: 1 } },
        });
        if (count === 1) {
            claimed.push({
                id: candidate.id,
                battleId: candidate.battleId,
                topic: candidate.topic,
                payload: candidate.payload,
                attempts: candidate.attempts + 1,
            });
        }
    }
    return claimed;
}

/** Marks a message done. */
export async function completeOutbox(id: string, now: Date): Promise<void> {
    await prisma.battleOutbox.update({
        where: { id },
        data: { processedAt: now, lockedAt: null, lockedBy: null, lastError: null },
    });
}

/**
 * Records a failure and either schedules a retry or dead-letters the message.
 *
 * Dead-lettering is an incident, not a dropped job: the battle is stuck in a non-terminal
 * state and something has to look at it. The backoff is exponential and capped, which
 * matters most for `await-beacon` during a drand outage, where the right behaviour is to
 * keep retrying the *same* round rather than give up on it (§E).
 */
export async function failOutbox(
    message: Pick<ClaimedMessage, 'id' | 'attempts'>,
    error: string,
    now: Date,
): Promise<{ deadLettered: boolean; retryAt: Date | null }> {
    if (message.attempts >= MAX_OUTBOX_ATTEMPTS) {
        await prisma.battleOutbox.update({
            where: { id: message.id },
            data: { deadLetteredAt: now, lockedAt: null, lockedBy: null, lastError: error },
        });
        return { deadLettered: true, retryAt: null };
    }
    const retryAt = new Date(now.getTime() + retryDelaySeconds(message.attempts) * 1000);
    await prisma.battleOutbox.update({
        where: { id: message.id },
        data: { lockedAt: null, lockedBy: null, lastError: error, availableAt: retryAt },
    });
    return { deadLettered: false, retryAt };
}

/**
 * Reschedules a message without treating the wait as a failure.
 *
 * Waiting for a drand round to publish is the expected, common case for `await-beacon`, not an
 * error: `failOutbox`'s exponential backoff and eventual dead-lettering exist for something
 * actually going wrong, and applying them here would dead-letter a perfectly healthy battle
 * just because its committed round has not arrived yet. `attempts` and `lastError` are left
 * untouched, so a genuine failure later still starts its own backoff from zero.
 */
export async function rescheduleOutbox(id: string, availableAt: Date): Promise<void> {
    await prisma.battleOutbox.update({
        where: { id },
        data: { availableAt, lockedAt: null, lockedBy: null },
    });
}

/** Exponential backoff in seconds for the nth attempt (1-based), capped. */
export function retryDelaySeconds(attempts: number): number {
    const delay = BASE_RETRY_SECONDS * 2 ** Math.max(0, attempts - 1);
    return Math.min(delay, MAX_RETRY_SECONDS);
}

/**
 * Messages that failed permanently. Surfaced for the §J alert rather than for a retry
 * loop: a dead letter means a human decides what happens to that battle.
 */
export async function listDeadLetters(limit = 100): Promise<ClaimedMessage[]> {
    const rows = await prisma.battleOutbox.findMany({
        where: { deadLetteredAt: { not: null } },
        orderBy: { deadLetteredAt: 'desc' },
        take: limit,
    });
    return rows.map((row) => ({
        id: row.id,
        battleId: row.battleId,
        topic: row.topic,
        payload: row.payload,
        attempts: row.attempts,
    }));
}
