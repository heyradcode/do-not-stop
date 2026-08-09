import { describe, expect, it } from 'vitest';

import { BattleState } from '@generated/prisma/enums';

import {
    ALLOWED_TRANSITIONS,
    BATTLE_HAPPY_PATH,
    classifyTransition,
    isCommitted,
    isTerminal,
    shouldReleaseLocks,
    TERMINAL_STATES,
} from '@features/battle/ledger';

describe('happy path', () => {
    it('is walkable end to end', () => {
        for (let i = 0; i < BATTLE_HAPPY_PATH.length - 1; i++) {
            expect(classifyTransition(BATTLE_HAPPY_PATH[i]!, BATTLE_HAPPY_PATH[i + 1]!)).toBe('advance');
        }
    });

    it('cannot be skipped', () => {
        // Jumping straight to signed would mean signing a result nothing verified.
        expect(classifyTransition(BattleState.committed, BattleState.signed)).toBe('illegal');
        expect(classifyTransition(BattleState.accepted, BattleState.computed)).toBe('illegal');
    });

    it('cannot run backwards', () => {
        expect(classifyTransition(BattleState.computed, BattleState.seeded)).toBe('illegal');
        expect(classifyTransition(BattleState.published, BattleState.signed)).toBe('illegal');
    });
});

describe('no cancellation after commitment', () => {
    it('allows rejection only before a round is committed', () => {
        // The grinding defence from §E: a player who could abandon a seeded battle for
        // free would keep only the ones that seeded well.
        expect(classifyTransition(BattleState.accepted, BattleState.rejected)).toBe('advance');
        for (const state of [
            BattleState.committed,
            BattleState.seeded,
            BattleState.computed,
            BattleState.verified,
            BattleState.signed,
        ]) {
            expect(classifyTransition(state, BattleState.rejected)).toBe('illegal');
        }
    });

    it('reports whether a battle is past the point of no return', () => {
        expect(isCommitted(BattleState.accepted)).toBe(false);
        expect(isCommitted(BattleState.committed)).toBe(true);
        expect(isCommitted(BattleState.seeded)).toBe(true);
    });

    it('offers forfeit instead, but only where the pipeline can actually stall', () => {
        // A permanent outage has to end the battle somehow. Forfeit does it with no
        // progression change, so manufacturing an outage gains nothing. `computed` is here
        // because the verifier can be unreachable until the outbox gives up, which strands
        // the battle and its pets' locks exactly as a beacon outage would.
        expect(classifyTransition(BattleState.committed, BattleState.forfeited)).toBe('advance');
        expect(classifyTransition(BattleState.seeded, BattleState.forfeited)).toBe('advance');
        expect(classifyTransition(BattleState.computed, BattleState.forfeited)).toBe('advance');

        // Not from everywhere: past signing there is a signed receipt, and a battle with one
        // is resolved rather than abandonable.
        expect(classifyTransition(BattleState.verified, BattleState.forfeited)).toBe('illegal');
        expect(classifyTransition(BattleState.signed, BattleState.forfeited)).toBe('illegal');
    });
});

describe('failure states', () => {
    it('reaches verification_failed only from computed', () => {
        expect(classifyTransition(BattleState.computed, BattleState.verification_failed)).toBe('advance');
        for (const state of [BattleState.seeded, BattleState.verified, BattleState.signed]) {
            expect(classifyTransition(state, BattleState.verification_failed)).toBe('illegal');
        }
    });

    it('reaches signing_failed only from verified', () => {
        expect(classifyTransition(BattleState.verified, BattleState.signing_failed)).toBe('advance');
        expect(classifyTransition(BattleState.computed, BattleState.signing_failed)).toBe('illegal');
    });

    it('expires only before a commitment exists', () => {
        expect(classifyTransition(BattleState.accepted, BattleState.expired)).toBe('advance');
        expect(classifyTransition(BattleState.committed, BattleState.expired)).toBe('illegal');
    });
});

describe('idempotence', () => {
    it('treats a repeat of the same state as a no-op', () => {
        // At-least-once delivery means this is the normal case for a retry, not an error.
        for (const state of Object.values(BattleState)) {
            expect(classifyTransition(state, state)).toBe('noop');
        }
    });
});

describe('terminal states', () => {
    it('have no outgoing transitions', () => {
        for (const state of TERMINAL_STATES) {
            expect(ALLOWED_TRANSITIONS[state]).toEqual([]);
            expect(isTerminal(state)).toBe(true);
        }
    });

    it('cover every state with no outgoing edge', () => {
        // Keeps TERMINAL_STATES from drifting out of sync with the transition table.
        const withoutEdges = Object.values(BattleState).filter((s) => ALLOWED_TRANSITIONS[s].length === 0);
        expect([...withoutEdges].sort()).toEqual([...TERMINAL_STATES].sort());
    });

    it('release both pets on every terminal state, and on signed', () => {
        for (const state of TERMINAL_STATES) {
            expect(shouldReleaseLocks(state)).toBe(true);
        }
        expect(shouldReleaseLocks(BattleState.signed)).toBe(true);
    });

    it('keeps locks held only while the fight itself could still change', () => {
        // Once signed, nothing about publishing or batching can change a pet's outcome, so the
        // release check itself does not need to fire again at those later states — the pets are
        // already free from the moment signing succeeds.
        for (const state of BATTLE_HAPPY_PATH.filter((s) => !isTerminal(s) && s !== BattleState.signed)) {
            expect(shouldReleaseLocks(state)).toBe(false);
        }
    });
});

describe('transition table completeness', () => {
    it('has an entry for every state', () => {
        for (const state of Object.values(BattleState)) {
            expect(ALLOWED_TRANSITIONS[state]).toBeDefined();
        }
    });

    it('names only real states as targets', () => {
        const known = new Set<string>(Object.values(BattleState));
        for (const targets of Object.values(ALLOWED_TRANSITIONS)) {
            for (const target of targets) {
                expect(known.has(target)).toBe(true);
            }
        }
    });

    it('makes every non-terminal state reachable from accepted', () => {
        const seen = new Set<BattleState>([BattleState.accepted]);
        const queue: BattleState[] = [BattleState.accepted];
        while (queue.length > 0) {
            for (const next of ALLOWED_TRANSITIONS[queue.shift()!]) {
                if (!seen.has(next)) {
                    seen.add(next);
                    queue.push(next);
                }
            }
        }
        // An unreachable state is dead code that looks like a feature.
        expect(seen.size).toBe(Object.values(BattleState).length);
    });
});
