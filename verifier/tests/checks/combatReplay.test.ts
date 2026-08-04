import { SOURCE_DEFAULT_RULESET } from '@cryptopets/protocol';
import { describe, expect, it } from 'vitest';

import { checkCombatReplay } from '../../src/checks/combatReplay';
import { buildReceipt } from '../fixtures/signedReceipt';

describe('checkCombatReplay', () => {
    it('passes when the fight reproduces from the receipt own inputs', () => {
        expect(checkCombatReplay(buildReceipt(), SOURCE_DEFAULT_RULESET)).toEqual({
            check: 'combat-replay',
            ok: true,
        });
    });

    it('is deterministic: the same receipt replays the same way every time', () => {
        const receipt = buildReceipt();
        expect(checkCombatReplay(receipt, SOURCE_DEFAULT_RULESET)).toEqual(
            checkCombatReplay(receipt, SOURCE_DEFAULT_RULESET),
        );
    });

    it('catches a flipped winner', () => {
        const honest = buildReceipt();
        const flipped = buildReceipt({
            patch: { result: { ...honest.result, attackerWon: !honest.result.attackerWon } },
        });
        const result = checkCombatReplay(flipped, SOURCE_DEFAULT_RULESET);
        expect(result.ok).toBe(false);
        expect(result.detail).toMatch(/attackerWon: replay=(true|false) receipt=(true|false)/);
    });

    it('catches an altered round count and winner HP together', () => {
        const honest = buildReceipt();
        const altered = buildReceipt({
            patch: {
                result: {
                    attackerWon: honest.result.attackerWon,
                    rounds: honest.result.rounds + 1,
                    winnerHpRemaining: honest.result.winnerHpRemaining + 1,
                },
            },
        });
        const result = checkCombatReplay(altered, SOURCE_DEFAULT_RULESET);
        expect(result.ok).toBe(false);
        expect(result.detail).toMatch(/rounds:/);
        expect(result.detail).toMatch(/winnerHpRemaining:/);
    });

    it('catches a log that differs even when the summary result is honest', () => {
        // The reason the log hash is checked at all: winner and round count can be true
        // while the blow-by-blow tells a different story about how it got there.
        const tampered = buildReceipt({ patch: { combatLogHash: `0x${'cc'.repeat(32)}` } });
        const result = checkCombatReplay(tampered, SOURCE_DEFAULT_RULESET);
        expect(result.ok).toBe(false);
        expect(result.detail).toMatch(/combatLogHash/);
    });

    it('fails against the wrong ruleset rather than producing a false pass', () => {
        // Replaying with balance values the battle was not fought under must not quietly
        // agree. This is why the bundle is resolved by hash, never assumed.
        //
        // `bloodlustBps` specifically because the fixture defender has the Bloodlust
        // archetype (skill 7) and its heal applies on every physical hit. Most other
        // fields leave this particular fight identical — the attacker's Fury (skill 4)
        // never triggers here, for instance — which would make the test pass for the
        // wrong reason.
        const receipt = buildReceipt();
        const tweaked = {
            ...SOURCE_DEFAULT_RULESET,
            skillConfig: { ...SOURCE_DEFAULT_RULESET.skillConfig, bloodlustBps: 5000 },
        };
        expect(checkCombatReplay(receipt, tweaked).ok).toBe(false);
    });
});
