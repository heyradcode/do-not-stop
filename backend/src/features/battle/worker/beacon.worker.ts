import { type ChainId, deriveBattleSeed, type Hex } from '@cryptopets/protocol';
import { BattleState } from '@generated/prisma/enums';
import type { Prisma } from '@generated/prisma/client';

import { env } from '@config/env';
import { prisma } from '@config/prisma';
import {
    applyTransition,
    type ClaimedMessage,
    completeOutbox,
    OUTBOX_TOPICS,
    rescheduleOutbox,
} from '@features/battle/ledger';
import { fetchVerifiedRound, roundPublishTime } from '@features/battle/randomness';
import { notifyBattleRoomIfPresent } from '@ws/battleRoomSocket';

/**
 * Handles `await-beacon` messages: `committed` -> `seeded` (§E, §J).
 *
 * Three outcomes for one message, and only one of them completes it:
 *
 * - **Verified.** The committed round published and its signature checks out. Derive the
 *   seed, move to `seeded`, enqueue `compute`. This is the only path that finishes the
 *   message.
 * - **Not yet published, or every drand endpoint failed.** Reschedule for the round's next
 *   expected publish time (or a short poll interval if it is already overdue). This is never
 *   treated as a job failure — §E requires retrying the *same* round indefinitely, and the
 *   outbox's exponential backoff exists for something actually wrong, not for ordinary
 *   waiting.
 * - **The round has been overdue longer than `forfeitAfterSeconds`.** Move to `forfeited`
 *   instead of continuing to wait. No progression change, both pets stay locked through their
 *   normal cooldown (locks release on any terminal state, forfeited included, so this is
 *   "cooldown", not "stuck locked forever" — a repeat-forfeiter is a rate-limit matter, not
 *   this worker's job).
 *
 * A round is never substituted for a different one at any point in this function. The only
 * two things that ever happen to a stalled round are "keep waiting" and "give up entirely."
 */
export async function processAwaitBeaconMessage(message: ClaimedMessage, nowSeconds: number): Promise<void> {
    const battle = await prisma.battleLedger.findUnique({ where: { battleId: message.battleId } });
    if (!battle) {
        // The battle was rejected or expired before this message was ever claimed (Stage A
        // failed after Stage A's own outbox entry, if any, was already written). Nothing to do.
        await completeOutbox(message.id, new Date(nowSeconds * 1000));
        return;
    }
    if (battle.state !== BattleState.committed) {
        // Already advanced past this by another worker, or by a retry of this same message
        // that completed after a timeout. Either way this is the idempotent no-op case.
        await completeOutbox(message.id, new Date(nowSeconds * 1000));
        return;
    }

    const round = Number(battle.drandRound);
    const dueAt = roundPublishTime(round);
    const overdueSeconds = nowSeconds - Math.floor(dueAt.getTime() / 1000);

    const outcome = await fetchVerifiedRound(round, nowSeconds);

    if (outcome.status === 'verified') {
        const seed = deriveBattleSeed({
            domain: { chainId: battle.chainId as ChainId, deploymentId: battle.deploymentId },
            drandRandomness: outcome.beacon.randomness,
            battleId: battle.battleId,
            snapshotHash: battle.snapshotHash as Hex,
            rulesetHash: battle.rulesetHash as Hex,
        });

        const patch: Prisma.BattleLedgerUncheckedUpdateInput = {
            beaconSignature: outcome.beacon.signature,
            beaconRandomness: outcome.beacon.randomness,
            seed: seed.hex,
        };
        await applyTransition({
            battleId: battle.battleId,
            from: BattleState.committed,
            to: BattleState.seeded,
            patch,
            outbox: [{ battleId: battle.battleId, topic: OUTBOX_TOPICS.compute }],
        });
        notifyBattleRoomIfPresent(battle.roomId, { type: 'battle-updated', battleId: battle.battleId, state: BattleState.seeded });
        await completeOutbox(message.id, new Date(nowSeconds * 1000));
        return;
    }

    if (overdueSeconds > env.battle.forfeitAfterSeconds) {
        await applyTransition({
            battleId: battle.battleId,
            from: BattleState.committed,
            to: BattleState.forfeited,
            patch: { failureReason: `drand round ${round} unavailable for ${overdueSeconds}s: ${describeOutcome(outcome)}` },
        });
        notifyBattleRoomIfPresent(battle.roomId, { type: 'battle-updated', battleId: battle.battleId, state: BattleState.forfeited });
        await completeOutbox(message.id, new Date(nowSeconds * 1000));
        return;
    }

    // Still within the forfeit window: reschedule, never fail. Poll again either at the
    // round's due time (if it has not arrived yet) or on a short fixed interval (if it is
    // merely late), so a slow endpoint gets checked again soon rather than sitting idle.
    const nextCheck =
        outcome.status === 'not-yet-published'
            ? dueAt
            : new Date(nowSeconds * 1000 + env.battle.workerPollIntervalMs);
    await rescheduleOutbox(message.id, nextCheck);
}

function describeOutcome(outcome: Awaited<ReturnType<typeof fetchVerifiedRound>>): string {
    return outcome.status === 'unavailable' ? outcome.detail : outcome.status;
}
