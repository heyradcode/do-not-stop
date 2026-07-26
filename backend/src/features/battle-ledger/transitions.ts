import type { BattleState } from '@generated/prisma/enums';
import type { Prisma } from '@generated/prisma/client';

import { prisma } from '@config/prisma';

import { enqueueOutbox, type OutboxMessage } from './outbox';
import { classifyTransition, IllegalTransitionError, shouldReleaseLocks } from './state';

/**
 * Transactional state transitions for the battle ledger (§J).
 *
 * Every transition here does three things in one transaction: move the state, write the
 * fields that move with it, and enqueue the outbox message for whatever comes next. If any
 * of those can happen without the others, a battle can end up advanced with nothing
 * scheduled, or scheduled twice.
 *
 * Concurrency is handled by guarding the update on the expected current state rather than
 * by reading first and hoping. Two workers racing on the same transition means one updates
 * zero rows, which is reported as a no-op, not an error: the work was done, just not by
 * this caller.
 */

/** Fields a transition may write alongside the state change. */
export type BattleLedgerPatch = Omit<Prisma.BattleLedgerUncheckedUpdateInput, 'state' | 'battleId'>;

export interface TransitionRequest {
    battleId: string;
    /** The state the caller believes the battle is in. */
    from: BattleState;
    to: BattleState;
    /** Columns to write as part of the same transaction. */
    patch?: BattleLedgerPatch;
    /** Messages to enqueue atomically with the transition. */
    outbox?: readonly OutboxMessage[];
}

export interface TransitionResult {
    /** False when the battle was already in the target state, or another worker got there first. */
    applied: boolean;
    state: BattleState;
}

/**
 * Applies one transition.
 *
 * Throws `IllegalTransitionError` for a move the state machine does not allow, which is a
 * bug rather than a race. Returns `applied: false` for a retry or a lost race, which is
 * normal under at-least-once delivery.
 */
export async function applyTransition(request: TransitionRequest): Promise<TransitionResult> {
    const kind = classifyTransition(request.from, request.to);
    if (kind === 'illegal') {
        throw new IllegalTransitionError(request.battleId, request.from, request.to);
    }
    if (kind === 'noop') {
        return { applied: false, state: request.to };
    }

    return prisma.$transaction(
        async (tx) => {
            const { count } = await tx.battleLedger.updateMany({
                // The guard is the concurrency control: only the caller that finds the
                // battle in `from` gets to move it.
                where: { battleId: request.battleId, state: request.from },
                data: { ...(request.patch ?? {}), state: request.to },
            });
            if (count === 0) {
                const current = await tx.battleLedger.findUnique({
                    where: { battleId: request.battleId },
                    select: { state: true },
                });
                if (!current) {
                    throw new Error(`battle ${request.battleId} does not exist`);
                }
                // Someone else advanced it, or it was never in `from`. Either way this
                // caller has nothing to do; the state it reports is the truth.
                return { applied: false, state: current.state };
            }

            if (request.outbox && request.outbox.length > 0) {
                await enqueueOutbox(tx, request.outbox);
            }
            if (shouldReleaseLocks(request.to)) {
                // Terminal states free both pets. Doing it here rather than in a follow-up
                // job means a pet cannot stay locked because a cleanup message was lost.
                await tx.petBattleLock.deleteMany({ where: { battleId: request.battleId } });
            }

            return { applied: true, state: request.to };
        },
        { isolationLevel: 'Serializable' },
    );
}

/** What opening a battle needs, beyond the ledger row's own columns. */
export interface OpenBattleRequest {
    ledger: Prisma.BattleLedgerUncheckedCreateInput;
    /** Pet ids to lock for the duration, as decimal strings. */
    petIds: readonly string[];
    outbox?: readonly OutboxMessage[];
}

/**
 * Creates a ledger row, locks both pets, and enqueues the first message, atomically.
 *
 * Lock rows are inserted in ascending numeric pet-id order. Two battles involving the same
 * pair, submitted at the same moment, therefore contend on the same row first, so one of
 * them fails cleanly on the primary key instead of the two deadlocking against each other
 * (threat T11). Numeric rather than lexicographic, because pet ids are decimal strings and
 * `"10" < "9"` as text.
 */
export async function openBattle(request: OpenBattleRequest): Promise<{ battleId: string }> {
    const petIds = sortPetIds(request.petIds);

    return prisma.$transaction(
        async (tx) => {
            const ledger = await tx.battleLedger.create({ data: request.ledger });
            for (const petId of petIds) {
                // Sequential on purpose: the ordering is the deadlock avoidance, and
                // issuing these in parallel would throw it away.
                await tx.petBattleLock.create({
                    data: { chainId: ledger.chainId, petId, battleId: ledger.battleId },
                });
            }
            if (request.outbox && request.outbox.length > 0) {
                await enqueueOutbox(tx, request.outbox);
            }
            return { battleId: ledger.battleId };
        },
        { isolationLevel: 'Serializable' },
    );
}

/** Ascending numeric order, which is the lock-acquisition order. */
export function sortPetIds(petIds: readonly string[]): string[] {
    return [...petIds].sort((a, b) => {
        const left = BigInt(a);
        const right = BigInt(b);
        return left === right ? 0 : left < right ? -1 : 1;
    });
}

/** Current state, or null if the battle does not exist. */
export async function getBattleState(battleId: string): Promise<BattleState | null> {
    const row = await prisma.battleLedger.findUnique({ where: { battleId }, select: { state: true } });
    return row?.state ?? null;
}

/**
 * Records a failure transition with its reason.
 *
 * The reason is not decoration: `verification_failed` without saying what mismatched leaves
 * an operator diffing two engines by hand during an incident.
 */
export async function failBattle(
    battleId: string,
    from: BattleState,
    to: BattleState,
    reason: string,
): Promise<TransitionResult> {
    return applyTransition({ battleId, from, to, patch: { failureReason: reason } });
}
