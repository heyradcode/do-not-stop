import { describe, expect, it } from 'vitest';

import {
    assertDefenseAuthorization,
    authorizationCovers,
    type DefenseAuthorization,
    MAX_SCOPE_PET_IDS,
} from '../../src/consent';
import type { Hex } from '../../src/encoding/bytes';

const RULESET = `0x${'ab'.repeat(32)}` as Hex;
const OTHER_RULESET = `0x${'cd'.repeat(32)}` as Hex;

const VALID: DefenseAuthorization = {
    domain: { chainId: 'eip155:84532', deploymentId: 'base-sepolia-live' },
    defenderOwner: '0xabcdef0123456789abcdef0123456789abcdef01',
    scope: { kind: 'allPets' },
    rulesetHash: RULESET,
    minLevel: 5,
    maxLevel: 15,
    maxBattlesPerDay: 20,
    notBefore: 1861920000,
    expiresAt: 1893456000,
    revocationNonce: 0,
};

describe('assertDefenseAuthorization', () => {
    it('normalizes the owner', () => {
        const checked = assertDefenseAuthorization({
            ...VALID,
            defenderOwner: '0xABCDEF0123456789abcdef0123456789ABCDEF01',
        });
        expect(checked.defenderOwner).toBe('0xabcdef0123456789abcdef0123456789abcdef01');
    });

    it('copies the pet list rather than aliasing the caller array', () => {
        const petIds = [1n, 2n];
        const checked = assertDefenseAuthorization({ ...VALID, scope: { kind: 'pets', petIds } });
        petIds.push(3n);
        expect(checked.scope.kind === 'pets' && checked.scope.petIds).toEqual([1n, 2n]);
    });

    describe('scope', () => {
        it('rejects an empty explicit list, which would authorize nothing', () => {
            expect(() => assertDefenseAuthorization({ ...VALID, scope: { kind: 'pets', petIds: [] } })).toThrow(
                /at least one pet/,
            );
        });

        it('requires strictly ascending ids, so one set has exactly one hash', () => {
            expect(() =>
                assertDefenseAuthorization({ ...VALID, scope: { kind: 'pets', petIds: [9n, 7n] } }),
            ).toThrow(/strictly ascending/);
        });

        it('rejects duplicates, which the ascending rule also catches', () => {
            expect(() =>
                assertDefenseAuthorization({ ...VALID, scope: { kind: 'pets', petIds: [7n, 7n] } }),
            ).toThrow(/strictly ascending/);
        });

        it('rejects a list longer than the cap', () => {
            const petIds = Array.from({ length: MAX_SCOPE_PET_IDS + 1 }, (_, i) => BigInt(i + 1));
            expect(() => assertDefenseAuthorization({ ...VALID, scope: { kind: 'pets', petIds } })).toThrow(
                /may not exceed/,
            );
        });

        it('accepts a list exactly at the cap', () => {
            const petIds = Array.from({ length: MAX_SCOPE_PET_IDS }, (_, i) => BigInt(i + 1));
            expect(() => assertDefenseAuthorization({ ...VALID, scope: { kind: 'pets', petIds } })).not.toThrow();
        });

        it.each([0n, -1n])('rejects pet id %s', (petId) => {
            expect(() => assertDefenseAuthorization({ ...VALID, scope: { kind: 'pets', petIds: [petId] } })).toThrow(
                /not a valid pet id/,
            );
        });
    });

    describe('bounds', () => {
        it('rejects an inverted level band', () => {
            expect(() => assertDefenseAuthorization({ ...VALID, minLevel: 16, maxLevel: 15 })).toThrow(
                /exceeds maxLevel/,
            );
        });

        it('accepts a single-level band', () => {
            expect(() => assertDefenseAuthorization({ ...VALID, minLevel: 7, maxLevel: 7 })).not.toThrow();
        });

        it('rejects a zero daily cap, since refusal is expressed by not signing', () => {
            expect(() => assertDefenseAuthorization({ ...VALID, maxBattlesPerDay: 0 })).toThrow(
                /maxBattlesPerDay must be between 1/,
            );
        });

        it('rejects an inverted validity window', () => {
            expect(() => assertDefenseAuthorization({ ...VALID, notBefore: VALID.expiresAt })).toThrow(
                /must be before expiresAt/,
            );
        });

        it('rejects a negative revocation nonce', () => {
            expect(() => assertDefenseAuthorization({ ...VALID, revocationNonce: -1 })).toThrow(/revocationNonce/);
        });

        it('rejects a rulesetHash that is not 32 bytes', () => {
            expect(() => assertDefenseAuthorization({ ...VALID, rulesetHash: '0x1234' })).toThrow(/32-byte/);
        });

        it('rejects an owner with a newline, which would forge a line in the Solana message', () => {
            expect(() => assertDefenseAuthorization({ ...VALID, defenderOwner: '0xabc\npets: (all)' })).toThrow(
                /defenderOwner/,
            );
        });
    });
});

describe('authorizationCovers', () => {
    const query = {
        defenderPetId: 7n,
        attackerLevel: 10,
        rulesetHash: RULESET,
        nowSeconds: VALID.notBefore + 1,
    };

    it('covers a battle inside every bound', () => {
        expect(authorizationCovers(VALID, query)).toEqual({ covered: true });
    });

    it('reports why it does not cover, rather than a bare false', () => {
        // "the defender does not accept level 3 challengers" and "the authorization
        // expired" are different answers for the player and different alerts for us.
        expect(authorizationCovers(VALID, { ...query, nowSeconds: VALID.notBefore - 1 })).toEqual({
            covered: false,
            reason: 'not-yet-valid',
        });
        expect(authorizationCovers(VALID, { ...query, nowSeconds: VALID.expiresAt })).toEqual({
            covered: false,
            reason: 'expired',
        });
        expect(authorizationCovers(VALID, { ...query, attackerLevel: 4 })).toEqual({
            covered: false,
            reason: 'attacker-level-below-band',
        });
        expect(authorizationCovers(VALID, { ...query, attackerLevel: 16 })).toEqual({
            covered: false,
            reason: 'attacker-level-above-band',
        });
        expect(authorizationCovers(VALID, { ...query, rulesetHash: OTHER_RULESET })).toEqual({
            covered: false,
            reason: 'ruleset-mismatch',
        });
    });

    it('treats the validity window as half-open: notBefore inclusive, expiresAt exclusive', () => {
        expect(authorizationCovers(VALID, { ...query, nowSeconds: VALID.notBefore }).covered).toBe(true);
        expect(authorizationCovers(VALID, { ...query, nowSeconds: VALID.expiresAt - 1 }).covered).toBe(true);
        expect(authorizationCovers(VALID, { ...query, nowSeconds: VALID.expiresAt }).covered).toBe(false);
    });

    it('includes both band edges', () => {
        expect(authorizationCovers(VALID, { ...query, attackerLevel: 5 }).covered).toBe(true);
        expect(authorizationCovers(VALID, { ...query, attackerLevel: 15 }).covered).toBe(true);
    });

    it('honours an explicit pet scope', () => {
        const scoped: DefenseAuthorization = { ...VALID, scope: { kind: 'pets', petIds: [7n, 9n] } };
        expect(authorizationCovers(scoped, query).covered).toBe(true);
        expect(authorizationCovers(scoped, { ...query, defenderPetId: 8n })).toEqual({
            covered: false,
            reason: 'pet-not-covered',
        });
    });

    it('covers any pet under a blanket authorization', () => {
        expect(authorizationCovers(VALID, { ...query, defenderPetId: 999999n }).covered).toBe(true);
    });

    it('ignores ruleset-hash casing', () => {
        expect(authorizationCovers(VALID, { ...query, rulesetHash: RULESET.toUpperCase() as Hex }).covered).toBe(true);
    });
});
