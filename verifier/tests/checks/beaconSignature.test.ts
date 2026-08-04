import { describe, expect, it } from 'vitest';

import { checkBeaconSignature } from '../../src/checks/beaconSignature';
import { buildReceipt, FORGED_BEACON } from '../fixtures/signedReceipt';

describe('checkBeaconSignature', () => {
    it('passes a receipt carrying a genuine drand round', () => {
        expect(checkBeaconSignature(buildReceipt())).toEqual({ check: 'beacon-signature', ok: true });
    });

    it('catches a real signature presented as a different round', () => {
        // Everything cheaper passes here: the randomness really is the hash of the shipped
        // signature, and the seed really does derive from that randomness. Only the BLS
        // check notices, because the round number is the message being signed.
        const result = checkBeaconSignature(buildReceipt({ beacon: FORGED_BEACON }));
        expect(result.ok).toBe(false);
        expect(result.detail).toMatch(/does not verify against chain/);
    });

    it('needs no ruleset, so it still runs for a receipt naming an unavailable bundle', () => {
        const receipt = buildReceipt({ rulesetHash: `0x${'77'.repeat(32)}` });
        expect(checkBeaconSignature(receipt).ok).toBe(true);
    });

    it('fails rather than throwing on an unpinned drand chain', () => {
        const receipt = buildReceipt();
        const unpinned = { ...receipt, beacon: { ...receipt.beacon, chainHash: `0x${'99'.repeat(32)}` as const } };
        const result = checkBeaconSignature(unpinned);
        expect(result.ok).toBe(false);
        expect(result.detail).toMatch(/is not pinned/);
    });
});
