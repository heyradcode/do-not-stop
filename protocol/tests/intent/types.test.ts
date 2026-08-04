import { describe, expect, it } from 'vitest';

import { assertBattleIntent, type BattleIntent, isExpired } from '../../src/intent';

const VALID: BattleIntent = {
    domain: { chainId: 'eip155:84532', deploymentId: 'base-sepolia-live' },
    attackerOwner: '0xabcdef0123456789abcdef0123456789abcdef01',
    attackerPetId: 1n,
    defenderOwner: '0x2222222222222222222222222222222222222222',
    defenderPetId: 2n,
    challengeId: null,
    clientNonce: '01hq8z0000000000000000',
    rulesetHash: `0x${'ab'.repeat(32)}`,
    expiresAt: 1893456000,
};

describe('assertBattleIntent', () => {
    it('returns a normalized copy', () => {
        const checked = assertBattleIntent({ ...VALID, attackerOwner: '0xABCDEF0123456789abcdef0123456789ABCDEF01' });
        expect(checked.attackerOwner).toBe('0xabcdef0123456789abcdef0123456789abcdef01');
    });

    it('accepts a Solana intent', () => {
        expect(() =>
            assertBattleIntent({
                ...VALID,
                domain: { chainId: 'solana:devnet', deploymentId: 'local-dev' },
                attackerOwner: 'DRiP2Pn2K6fuMLKQmt5rZWyHiUZ6aK3TzhBd8ZUqzTqL',
                defenderOwner: 'GDDMwNyyx8uB6zrqwBFHjLLG3TBYk2F8Az4yrQC5RzMp',
            }),
        ).not.toThrow();
    });

    it('rejects an invalid domain', () => {
        expect(() => assertBattleIntent({ ...VALID, domain: { ...VALID.domain, deploymentId: 'Live Env' } })).toThrow(
            /invalid deploymentId/,
        );
    });

    it.each([0n, -1n, 1n << 256n])('rejects pet id %s', (attackerPetId) => {
        expect(() => assertBattleIntent({ ...VALID, attackerPetId })).toThrow(/attackerPetId/);
    });

    it('rejects an empty owner', () => {
        expect(() => assertBattleIntent({ ...VALID, defenderOwner: '' })).toThrow(/defenderOwner/);
    });

    it('rejects a rulesetHash that is not 32 bytes', () => {
        expect(() => assertBattleIntent({ ...VALID, rulesetHash: '0x1234' })).toThrow(/32-byte/);
    });

    it.each([0, -1, 1.5])('rejects expiresAt %s', (expiresAt) => {
        expect(() => assertBattleIntent({ ...VALID, expiresAt })).toThrow(/expiresAt/);
    });

    it('rejects an empty challengeId, so absent and present can never both mean ""', () => {
        expect(() => assertBattleIntent({ ...VALID, challengeId: '' })).toThrow(/challengeId/);
    });

    it('rejects a too-short nonce', () => {
        expect(() => assertBattleIntent({ ...VALID, clientNonce: 'short' })).toThrow(/clientNonce/);
    });

    describe('message-framing injection', () => {
        // The Solana payload is labelled text, one field per line. A value carrying
        // a newline could forge extra lines and change what the wallet owner
        // believes they approved, so the charset is enforced at validation time
        // rather than at rendering time.
        it.each([
            'nonce\nexpires: 9999999999',
            'nonce\r\nchallenge: other',
            'nonce with spaces',
            'nonce\tand-tab',
            'nonce-with-emoji-🐉',
        ])('rejects clientNonce %j', (clientNonce) => {
            expect(() => assertBattleIntent({ ...VALID, clientNonce })).toThrow(/clientNonce/);
        });

        it('rejects a challengeId with a newline', () => {
            expect(() => assertBattleIntent({ ...VALID, challengeId: 'abc\nexpires: 0' })).toThrow(/challengeId/);
        });

        it('rejects an owner with a newline', () => {
            expect(() => assertBattleIntent({ ...VALID, attackerOwner: '0xabc\ndefender: x' })).toThrow(
                /attackerOwner/,
            );
        });
    });
});

describe('isExpired', () => {
    it('takes the clock as an argument, never reading it', () => {
        expect(isExpired(VALID, VALID.expiresAt - 1)).toBe(false);
        expect(isExpired(VALID, VALID.expiresAt)).toBe(true);
        expect(isExpired(VALID, VALID.expiresAt + 1)).toBe(true);
    });
});
