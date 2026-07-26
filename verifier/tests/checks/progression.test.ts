import { SOURCE_DEFAULT_RULESET } from '@cryptopets/protocol';
import { describe, expect, it } from 'vitest';

import { checkProgression } from '../../src/checks/progression';
import { buildReceipt, FORGED_BEACON } from '../fixtures/signedReceipt';

describe('checkProgression', () => {
    it('passes a receipt whose XP and level change reproduces', () => {
        expect(checkProgression(buildReceipt(), SOURCE_DEFAULT_RULESET)).toEqual({
            check: 'progression',
            ok: true,
        });
    });

    it('catches inflated XP', () => {
        const honest = buildReceipt();
        const inflated = buildReceipt({
            patch: {
                progression: {
                    ...honest.progression,
                    attacker: { ...honest.progression.attacker, xp: 9999, xpAwarded: 9999 },
                },
            },
        });
        const result = checkProgression(inflated, SOURCE_DEFAULT_RULESET);
        expect(result.ok).toBe(false);
        expect(result.detail).toMatch(/attacker\.xp/);
    });

    it('catches a fabricated level-up', () => {
        const honest = buildReceipt();
        const promoted = buildReceipt({
            patch: {
                progression: {
                    ...honest.progression,
                    defender: { ...honest.progression.defender, level: 99, leveledUp: true },
                },
            },
        });
        const result = checkProgression(promoted, SOURCE_DEFAULT_RULESET);
        expect(result.ok).toBe(false);
        expect(result.detail).toMatch(/defender\.level/);
    });

    it('catches tampering with the same-opponent decay state the award depends on', () => {
        const honest = buildReceipt();
        const tampered = buildReceipt({
            patch: {
                progression: {
                    ...honest.progression,
                    defender: { ...honest.progression.defender, streak: 0 },
                },
            },
        });
        expect(checkProgression(tampered, SOURCE_DEFAULT_RULESET).ok).toBe(false);
    });

    it('fails against the wrong level cap rather than producing a false pass', () => {
        // Parameters that do not match the named ruleset must not quietly agree.
        const receipt = buildReceipt();
        expect(checkProgression(receipt, { ...SOURCE_DEFAULT_RULESET, maxLevel: 1 }).ok).toBe(false);
    });

    it('does not care about the beacon, which is the other check job', () => {
        expect(checkProgression(buildReceipt({ beacon: FORGED_BEACON }), SOURCE_DEFAULT_RULESET).ok).toBe(true);
    });
});
