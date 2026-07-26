import { BattleState } from '@generated/prisma/enums';

/**
 * The battle lifecycle from §J of docs/plan-backend-battle-architecture.md, as code.
 *
 * Two properties are enforced here rather than left to the caller:
 *
 * - **`rejected` exists only before `committed`.** Once a battle is bound to a drand
 *   round it resolves. Free abandonment after a seed exists would let a player submit
 *   many battles and keep the ones that seeded well, which is outcome grinding (threat
 *   T5), so there is no edge from `committed` back to `rejected`.
 * - **Every transition is idempotent.** Jobs are processed at least once, so a worker
 *   re-applying a transition that already landed must be a no-op rather than an error.
 *   `classifyTransition` says which of the three cases a request is, so a retry and a
 *   genuine illegal move never look alike.
 */

/** Happy path, in order. */
export const BATTLE_HAPPY_PATH: readonly BattleState[] = [
    BattleState.accepted,
    BattleState.committed,
    BattleState.seeded,
    BattleState.computed,
    BattleState.verified,
    BattleState.signed,
    BattleState.published,
    BattleState.batched,
];

/** States a battle never leaves. */
export const TERMINAL_STATES: readonly BattleState[] = [
    BattleState.batched,
    BattleState.rejected,
    BattleState.expired,
    BattleState.verification_failed,
    BattleState.signing_failed,
    BattleState.forfeited,
];

/**
 * Legal moves out of each state.
 *
 * `forfeited` is reachable from `committed` and `seeded` because a permanent beacon
 * outage has to end the battle somehow, and ending it with no progression change plus a
 * cooldown is the option that does not reward manufacturing an outage (§E).
 *
 * `verification_failed` is reachable only from `computed`: it means the TypeScript
 * engine and the Go verifier disagreed, which stops signing for that ruleset rather
 * than silently preferring one implementation (§F).
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<BattleState, readonly BattleState[]>> = {
    [BattleState.accepted]: [BattleState.committed, BattleState.rejected, BattleState.expired],
    [BattleState.committed]: [BattleState.seeded, BattleState.forfeited],
    [BattleState.seeded]: [BattleState.computed, BattleState.forfeited],
    [BattleState.computed]: [BattleState.verified, BattleState.verification_failed],
    [BattleState.verified]: [BattleState.signed, BattleState.signing_failed],
    [BattleState.signed]: [BattleState.published],
    [BattleState.published]: [BattleState.batched],
    [BattleState.batched]: [],
    [BattleState.rejected]: [],
    [BattleState.expired]: [],
    [BattleState.verification_failed]: [],
    [BattleState.signing_failed]: [],
    [BattleState.forfeited]: [],
};

/** What a requested transition actually is. */
export type TransitionKind = 'advance' | 'noop' | 'illegal';

/**
 * Classifies a requested move.
 *
 * `noop` covers the retry case: the battle is already in the target state, so the work
 * was done and re-running it changes nothing. Treating that as an error would turn
 * at-least-once delivery into a stream of false alarms; treating it as an advance would
 * let a transition's side effects run twice.
 */
export function classifyTransition(from: BattleState, to: BattleState): TransitionKind {
    if (from === to) {
        return 'noop';
    }
    return ALLOWED_TRANSITIONS[from].includes(to) ? 'advance' : 'illegal';
}

/** Whether a battle has reached a state it never leaves. */
export function isTerminal(state: BattleState): boolean {
    return TERMINAL_STATES.includes(state);
}

/**
 * Whether a battle is past the point where it can still be rejected.
 *
 * The rule this expresses: after `committed`, a battle resolves. Callers wanting to
 * abandon one should be checking this rather than reimplementing the reasoning.
 */
export function isCommitted(state: BattleState): boolean {
    return state !== BattleState.accepted;
}

/**
 * Whether locks on both pets should be released once a battle reaches `state`.
 *
 * Every terminal state releases, plus `signed` specifically: once a receipt is
 * signed, the fight is fully sealed and nothing about `published`/`batched`
 * afterward can change a pet's outcome. Waiting for `batched` instead — the
 * periodic, possibly hours-later aggregation step (§I) — would leave both pets
 * unable to battle again for however long batching happens to take, which has
 * nothing to do with why a lock exists in the first place (one open battle per
 * pet, not "until the receipt is aggregated").
 */
export function shouldReleaseLocks(state: BattleState): boolean {
    return isTerminal(state) || state === BattleState.signed;
}

/** Thrown for an illegal move, so callers can distinguish it from a retry. */
export class IllegalTransitionError extends Error {
    constructor(
        readonly battleId: string,
        readonly from: BattleState,
        readonly to: BattleState,
    ) {
        super(`battle ${battleId} cannot move from ${from} to ${to}`);
        this.name = 'IllegalTransitionError';
    }
}
