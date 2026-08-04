import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
    forgetBattleEvidence,
    listBattleEvidenceIds,
    readBattleEvidence,
    saveBattleEvidence,
    setEvidenceStore,
    type BattleEvidence,
    type EvidenceStore,
} from '../../src/utils/battleEvidence';

function memoryStore(): EvidenceStore & { map: Map<string, string> } {
    const map = new Map<string, string>();
    return {
        map,
        getItem: (key) => map.get(key) ?? null,
        setItem: (key, value) => void map.set(key, value),
        removeItem: (key) => void map.delete(key),
    };
}

function evidence(battleId: string): BattleEvidence {
    return {
        battleId,
        commitmentHash: `0x${'11'.repeat(32)}`,
        signature: `0x${'22'.repeat(65)}`,
        signingKeyId: 'battle-signer-2026-07',
        commitment: { drandRound: 1000, deploymentId: 'base-sepolia-live' },
        storedAt: 1_770_000_000_000,
    };
}

let store: ReturnType<typeof memoryStore>;

beforeEach(() => {
    store = memoryStore();
    setEvidenceStore(store);
});

afterEach(() => {
    setEvidenceStore(null);
});

describe('saving and reading', () => {
    it('round-trips a battle evidence record verbatim', () => {
        saveBattleEvidence(evidence('btl_0001'));
        expect(readBattleEvidence('btl_0001')).toEqual(evidence('btl_0001'));
    });

    it('preserves the commitment object exactly, so it can be re-hashed later', () => {
        // The stored commitment is the thing a verifier re-hashes; a lossy round trip
        // would leave the player holding evidence that no longer checks out.
        const original = evidence('btl_0001');
        saveBattleEvidence(original);
        expect(readBattleEvidence('btl_0001')?.commitment).toEqual(original.commitment);
    });

    it('returns null for a battle it never stored', () => {
        expect(readBattleEvidence('btl_missing')).toBeNull();
    });

    it('replaces an earlier copy for the same battle rather than duplicating it', () => {
        saveBattleEvidence(evidence('btl_0001'));
        saveBattleEvidence({ ...evidence('btl_0001'), signingKeyId: 'battle-signer-2026-08' });

        expect(readBattleEvidence('btl_0001')?.signingKeyId).toBe('battle-signer-2026-08');
        expect(listBattleEvidenceIds()).toEqual(['btl_0001']);
    });

    it('tracks every stored battle in the index', () => {
        saveBattleEvidence(evidence('btl_0001'));
        saveBattleEvidence(evidence('btl_0002'));
        expect(listBattleEvidenceIds()).toEqual(['btl_0001', 'btl_0002']);
    });

    it('forgets one battle without disturbing the others', () => {
        saveBattleEvidence(evidence('btl_0001'));
        saveBattleEvidence(evidence('btl_0002'));

        forgetBattleEvidence('btl_0001');

        expect(readBattleEvidence('btl_0001')).toBeNull();
        expect(readBattleEvidence('btl_0002')).not.toBeNull();
        expect(listBattleEvidenceIds()).toEqual(['btl_0002']);
    });
});

describe('surviving a hostile store', () => {
    it('reads null rather than throwing on a corrupted blob', () => {
        store.map.set('cryptopets.battle-evidence.btl_0001', 'not json');
        expect(readBattleEvidence('btl_0001')).toBeNull();
    });

    it('rejects a blob that lost its identifying fields', () => {
        // Present but unusable is not evidence of anything, and returning it would let a
        // caller believe it holds a commitment it cannot check.
        store.map.set('cryptopets.battle-evidence.btl_0001', JSON.stringify({ storedAt: 1 }));
        expect(readBattleEvidence('btl_0001')).toBeNull();
    });

    it('returns an empty list when the index is corrupted', () => {
        store.map.set('cryptopets.battle-evidence.index', '{"not":"an array"}');
        expect(listBattleEvidenceIds()).toEqual([]);
    });

    it('does not throw when the store refuses writes', () => {
        // A full quota, or Safari private mode, must cost the player a convenience and
        // never the battle itself.
        setEvidenceStore({
            getItem: () => null,
            setItem: () => {
                throw new Error('QuotaExceededError');
            },
            removeItem: () => undefined,
        });

        expect(() => saveBattleEvidence(evidence('btl_0001'))).not.toThrow();
        expect(() => forgetBattleEvidence('btl_0001')).not.toThrow();
        expect(readBattleEvidence('btl_0001')).toBeNull();
    });
});
