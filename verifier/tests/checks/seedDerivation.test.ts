import { describe, expect, it } from 'vitest';

import { checkSeedDerivation } from '../../src/checks/seedDerivation';
import { buildReceipt, FORGED_BEACON } from '../fixtures/signedReceipt';

describe('checkSeedDerivation', () => {
    it('passes a seed that follows from the receipt own inputs', () => {
        expect(checkSeedDerivation(buildReceipt())).toEqual({ check: 'seed-derivation', ok: true });
    });

    it('fails a seed that was chosen rather than derived', () => {
        // The attack this check exists to stop: a favourable seed stapled onto a genuine
        // beacon and a genuine snapshot.
        const receipt = buildReceipt({ patch: { seed: `0x${'99'.repeat(32)}` } });
        const result = checkSeedDerivation(receipt);
        expect(result.ok).toBe(false);
        expect(result.detail).toMatch(/its own inputs derive 0x[0-9a-f]{64}/);
    });

    it('binds the seed to the battle id', () => {
        const first = buildReceipt({ battleId: 'btl_0001' });
        const second = buildReceipt({ battleId: 'btl_0002' });
        expect(first.seed).not.toBe(second.seed);
        expect(checkSeedDerivation({ ...first, seed: second.seed }).ok).toBe(false);
    });

    it('binds the seed to the ruleset hash', () => {
        const first = buildReceipt();
        const other = buildReceipt({ rulesetHash: `0x${'77'.repeat(32)}` });
        expect(first.seed).not.toBe(other.seed);
        expect(checkSeedDerivation({ ...first, seed: other.seed }).ok).toBe(false);
    });

    it('binds the seed to the beacon randomness', () => {
        const honest = buildReceipt();
        const forged = buildReceipt({ beacon: FORGED_BEACON });
        expect(honest.seed).not.toBe(forged.seed);
        expect(checkSeedDerivation({ ...honest, seed: forged.seed }).ok).toBe(false);
    });

    it('fails rather than throwing when the snapshot cannot be hashed', () => {
        const receipt = buildReceipt();
        const broken = { ...receipt, snapshot: { ...receipt.snapshot, takenAt: -1 } };
        const result = checkSeedDerivation(broken);
        expect(result.ok).toBe(false);
        expect(result.detail).toMatch(/could not derive the seed/);
    });
});
